import { heatDemandByGap, runTimeseriesToResponse, worstNightChart, type RawRunTimeseries } from "../../adapters/simulation";

/** Two days at 15-minute steps; day 2 is much colder. Rooms: living (heated), airlock (buffer). */
function raw(): RawRunTimeseries {
  const points: RawRunTimeseries["points"] = [];
  for (let i = 0; i < 192; i++) {
    const day2 = i >= 96;
    const hh = String(Math.floor((i % 96) / 4)).padStart(2, "0");
    const mm = String((i % 4) * 15).padStart(2, "0");
    points.push({
      timestamp: `2026-01-0${day2 ? 2 : 1}T${hh}:${mm}:00+05:30`,
      ambient_c: day2 ? -20 : -5,
      zone_temp_c: { living: 15, airlock: 0 },
      zone_heating_w: { living: 500, airlock: 100 },
      zone_solar_w: { living: 10, airlock: 0 },
    });
  }
  return { which: "conditioned", zone_ids: ["airlock", "living"], points };
}

describe("run series charts (same shaping as the website)", () => {
  const ts = runTimeseriesToResponse("opt_1", "conditioned", raw());

  it("maps the run series and infers the 15-minute step", () => {
    expect(ts.timestep_seconds).toBe(900);
    expect(ts.points[0].ambient_temperature_c).toBe(-5);
    expect(ts.points[0].zone_temperatures_c).toEqual({ living: 15, airlock: 0 });
  });

  it("inside-temperature chart picks the coldest 24 h and averages only heated rooms", () => {
    const chart = worstNightChart(ts);
    expect(chart.timestamps).toHaveLength(96);
    // First window (hourly stride, like the website) that reaches the coldest step, so it includes the cold day.
    expect(chart.timestamps.some((t) => t.startsWith("2026-01-02"))).toBe(true);
    expect(chart.series.find((s) => s.key === "__ambient")?.points.some((p) => p.value === -20)).toBe(true);
    const inside = chart.series.find((s) => s.key === "__inside");
    expect(inside?.points[0].value).toBe(15); // airlock (0 °C) is excluded
    expect(chart.series.find((s) => s.key === "__passive")).toBeUndefined();
  });

  it("adds the no-heater line when the free-floating run is supplied", () => {
    const free = runTimeseriesToResponse("opt_1", "free_floating", {
      ...raw(),
      points: raw().points.map((p) => ({ ...p, zone_temp_c: { living: 2, airlock: -3 } })),
    });
    const chart = worstNightChart(ts, free);
    expect(chart.series.find((s) => s.key === "__passive")?.points[0].value).toBe(2);
  });

  it("heating demand is averaged per 3 °C indoor-outdoor gap, only when colder outside", () => {
    const demand = heatDemandByGap(ts);
    // heated rooms = living only → inside 15; gaps 20 (day 1) and 35 (day 2) → buckets 21 and 36
    expect(demand.map((d) => d.deltaT)).toEqual([21, 36]);
    expect(demand.every((d) => d.watts === 500)).toBe(true);
    expect(demand.every((d) => d.samples === 96)).toBe(true);
  });
});
