/**
 * Multi-series line chart over a shared timestamp axis (SVG). Values are
 * plotted as given; long series are decimated for drawing only
 * (adapters/simulation.ts decimate — min/max preserving, never interpolated).
 */
import React, { useMemo, useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { G, Line, Polyline, Rect, Text as SvgText } from "react-native-svg";

import { decimate, type ChartSeries } from "../../adapters/simulation";
import { useTheme } from "../../theme";
import { formatTimestamp } from "../../utils/format";
import { extent, formatTick, niceTicks, scaleLinear } from "./scale";

export interface LineSeriesStyle {
  color: string;
  dashed?: boolean;
}

interface LineChartProps {
  timestamps: string[];
  series: ChartSeries[];
  styleFor: (series: ChartSeries, index: number) => LineSeriesStyle;
  yLabel: string;
  height?: number;
  /** Optional value → display transform (e.g. °C → °F); applied to plotted values and ticks alike. */
  transform?: (v: number) => number;
  /** Horizontal reference lines, in data units (after transform), e.g. 0 °C or the target setpoint. */
  refLines?: { value: number; color: string; label: string; dashed?: boolean }[];
  /** A shaded horizontal band, e.g. "at or above target"; `to` may be omitted to fill to the top. */
  band?: { from: number; to?: number; color: string };
  /** Replaces the default time axis, e.g. for a curve plotted against temperature difference. */
  xAxis?: { title: string; tickLabel: (index: number) => string };
}

const PAD = { left: 44, right: 10, top: 10, bottom: 34 };
const MAX_DRAW_POINTS = 400;

export function LineChart({ timestamps, series, styleFor, yLabel, height = 200, transform = (v) => v, refLines = [], band, xAxis }: LineChartProps) {
  const { colors, typography } = useTheme();
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const prepared = useMemo(() => {
    const drawn = series.map((s) => ({ ...s, points: decimate(s.points, MAX_DRAW_POINTS).map((p) => ({ i: p.i, value: transform(p.value) })) }));
    const values = drawn.flatMap((s) => s.points.map((p) => p.value));
    // Reference lines are kept in view so the chart never hides them.
    const dom = extent(values.length > 0 ? [...values, ...refLines.map((r) => r.value)] : []);
    return { drawn, dom };
  }, [series, transform, refLines]);

  const n = timestamps.length;
  if (!prepared.dom || n < 2) return <Text style={[typography.caption, { color: colors.textSecondary }]}>Not enough data to plot.</Text>;

  const { domain, ticks } = niceTicks(prepared.dom, 4);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const x = scaleLinear({ min: 0, max: n - 1 }, [PAD.left, PAD.left + plotW]);
  const y = scaleLinear(domain, [PAD.top + plotH, PAD.top]);
  const xTickIdx = [0, Math.floor((n - 1) / 2), n - 1];

  return (
    <View onLayout={onLayout} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {band ? (
            <Rect
              x={PAD.left}
              width={plotW}
              y={y(Math.min(band.to ?? domain.max, domain.max))}
              height={Math.max(0, y(Math.max(band.from, domain.min)) - y(Math.min(band.to ?? domain.max, domain.max)))}
              fill={band.color}
            />
          ) : null}
          {ticks.map((t) => (
            <G key={`y${t}`}>
              <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(t)} y2={y(t)} stroke={colors.chartGrid} strokeWidth={1} />
              <SvgText x={PAD.left - 6} y={y(t) + 4} fontSize={10} fill={colors.textSecondary} textAnchor="end">
                {formatTick(t)}
              </SvgText>
            </G>
          ))}
          {xTickIdx.map((i, k) => (
            <SvgText
              key={`x${i}`}
              x={x(i)}
              y={height - 18}
              fontSize={10}
              fill={colors.textSecondary}
              textAnchor={k === 0 ? "start" : k === xTickIdx.length - 1 ? "end" : "middle"}
            >
              {xAxis ? xAxis.tickLabel(i) : formatTimestamp(timestamps[i]).slice(0, 11)}
            </SvgText>
          ))}
          <SvgText x={PAD.left} y={height - 4} fontSize={10} fill={colors.textSecondary}>
            {xAxis ? xAxis.title : "Time (site local, as reported)"}
          </SvgText>
          <SvgText x={10} y={PAD.top + plotH / 2} fontSize={10} fill={colors.textSecondary} rotation={-90} originX={10} originY={PAD.top + plotH / 2} textAnchor="middle">
            {yLabel}
          </SvgText>
          {refLines.map((r) => (
            <G key={`ref${r.label}`}>
              <Line x1={PAD.left} x2={PAD.left + plotW} y1={y(r.value)} y2={y(r.value)} stroke={r.color} strokeWidth={1} strokeDasharray={r.dashed ? "3,3" : undefined} />
              <SvgText x={PAD.left + plotW - 2} y={y(r.value) - 3} fontSize={9} fill={r.color} textAnchor="end">
                {r.label}
              </SvgText>
            </G>
          ))}
          {prepared.drawn.map((s, idx) => {
            const style = styleFor(series[idx], idx);
            return (
              <Polyline
                key={s.key}
                points={s.points.map((p) => `${x(p.i)},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={style.color}
                strokeWidth={style.dashed ? 1.5 : 2}
                strokeDasharray={style.dashed ? "5,4" : undefined}
              />
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
