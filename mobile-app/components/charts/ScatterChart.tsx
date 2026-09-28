import React, { useState } from "react";
import { Text, View, type LayoutChangeEvent } from "react-native";
import Svg, { Circle, G, Line, Rect, Text as SvgText } from "react-native-svg";

import { useTheme } from "../../theme";
import { extent, formatTick, niceTicks, scaleLinear } from "./scale";

export interface ScatterPoint {
  id: string;
  x: number;
  y: number;
  /** Visual class — also stated in the legend and the tap label, never by color alone. */
  kind: "front" | "other" | "recommended";
  label: string;
}

interface ScatterChartProps {
  points: ScatterPoint[];
  xLabel: string;
  yLabel: string;
  height?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}

const PAD = { left: 48, right: 12, top: 12, bottom: 36 };

export function ScatterChart({ points, xLabel, yLabel, height = 240, selectedId, onSelect }: ScatterChartProps) {
  const { colors, typography } = useTheme();
  const [width, setWidth] = useState(0);
  const xd = extent(points.map((p) => p.x));
  const yd = extent(points.map((p) => p.y));
  if (!xd || !yd) return <Text style={[typography.caption, { color: colors.textSecondary }]}>No values to plot.</Text>;

  const xt = niceTicks(xd, 3);
  const yt = niceTicks(yd, 4);
  const plotW = Math.max(0, width - PAD.left - PAD.right);
  const plotH = height - PAD.top - PAD.bottom;
  const sx = scaleLinear(xt.domain, [PAD.left, PAD.left + plotW]);
  const sy = scaleLinear(yt.domain, [PAD.top + plotH, PAD.top]);

  return (
    <View onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)} style={{ height }}>
      {width > 0 ? (
        <Svg width={width} height={height}>
          {yt.ticks.map((t) => (
            <G key={`y${t}`}>
              <Line x1={PAD.left} x2={PAD.left + plotW} y1={sy(t)} y2={sy(t)} stroke={colors.chartGrid} />
              <SvgText x={PAD.left - 6} y={sy(t) + 4} fontSize={10} fill={colors.textSecondary} textAnchor="end">
                {formatTick(t)}
              </SvgText>
            </G>
          ))}
          {xt.ticks.map((t) => (
            <SvgText key={`x${t}`} x={sx(t)} y={PAD.top + plotH + 14} fontSize={10} fill={colors.textSecondary} textAnchor="middle">
              {formatTick(t)}
            </SvgText>
          ))}
          <SvgText x={PAD.left + plotW / 2} y={height - 4} fontSize={10} fill={colors.textSecondary} textAnchor="middle">
            {xLabel}
          </SvgText>
          <SvgText x={10} y={PAD.top + plotH / 2} fontSize={10} fill={colors.textSecondary} rotation={-90} originX={10} originY={PAD.top + plotH / 2} textAnchor="middle">
            {yLabel}
          </SvgText>
          {points.map((p) => {
            const cx = sx(p.x);
            const cy = sy(p.y);
            const selected = p.id === selectedId;
            const fill = p.kind === "other" ? "transparent" : p.kind === "recommended" ? colors.chart[1] : colors.chart[0];
            const stroke = p.kind === "other" ? colors.chartAmbient : fill;
            return (
              <G key={p.id} onPress={() => onSelect?.(p.id)}>
                {/* Large invisible hit area for touch. */}
                <Rect x={cx - 16} y={cy - 16} width={32} height={32} fill="transparent" />
                {p.kind === "recommended" ? (
                  <Rect x={cx - 7} y={cy - 7} width={14} height={14} fill={fill} stroke={selected ? colors.textPrimary : fill} strokeWidth={selected ? 2.5 : 1} />
                ) : (
                  <Circle cx={cx} cy={cy} r={6} fill={fill} stroke={selected ? colors.textPrimary : stroke} strokeWidth={selected ? 2.5 : 1.5} />
                )}
              </G>
            );
          })}
        </Svg>
      ) : null}
    </View>
  );
}
