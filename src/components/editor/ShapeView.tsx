import type { ShapeElement } from "../../bindings/ShapeElement";

export default function ShapeView({ element }: { element: ShapeElement }) {
  const { shape_type, fill, stroke, stroke_width, border_radius } = element;
  const strokeProps = stroke !== "none" ? { stroke, strokeWidth: stroke_width } : {};

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: "none" }}>
      {shape_type === "rectangle" && (
        <rect x={2} y={2} width={96} height={96} rx={border_radius ?? 0} fill={fill} {...strokeProps} />
      )}
      {shape_type === "ellipse" && <ellipse cx={50} cy={50} rx={48} ry={48} fill={fill} {...strokeProps} />}
      {shape_type === "triangle" && <polygon points="50,2 98,98 2,98" fill={fill} {...strokeProps} />}
      {shape_type === "line" && (
        <line x1={2} y1={50} x2={98} y2={50} stroke={stroke !== "none" ? stroke : fill} strokeWidth={stroke_width} />
      )}
      {shape_type === "arrow" && (
        <polygon points="2,40 70,40 70,20 98,50 70,80 70,60 2,60" fill={fill} {...strokeProps} />
      )}
      {shape_type === "star" && (
        <polygon points="50,2 61,37 98,37 68,59 79,95 50,73 21,95 32,59 2,37 39,37" fill={fill} {...strokeProps} />
      )}
    </svg>
  );
}
