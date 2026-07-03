import type { ShapeElement } from "../../bindings/ShapeElement";

export default function ShapeView({ element }: { element: ShapeElement }) {
  const { id, shape_type, fill, stroke, stroke_width, border_radius, stroke_dash, gradient_to, gradient_angle } =
    element;
  const dashProps = stroke_dash ? { strokeDasharray: `${stroke_dash} ${stroke_dash}` } : {};
  const fillValue = gradient_to ? `url(#grad-${id})` : fill;
  const strokeProps = stroke !== "none" ? { stroke, strokeWidth: stroke_width, ...dashProps } : {};

  // Vecteur de direction du dégradé sur le carré unitaire (approximation cohérente avec le
  // rendu natif, voir `draw_shape` dans raster.rs).
  const angleRad = ((gradient_angle ?? 0) * Math.PI) / 180;
  const dx = Math.cos(angleRad) / 2;
  const dy = Math.sin(angleRad) / 2;

  return (
    <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none" style={{ pointerEvents: "none" }}>
      {gradient_to && (
        <defs>
          <linearGradient
            id={`grad-${id}`}
            x1={`${50 - dx * 100}%`}
            y1={`${50 - dy * 100}%`}
            x2={`${50 + dx * 100}%`}
            y2={`${50 + dy * 100}%`}
          >
            <stop offset="0%" stopColor={fill} />
            <stop offset="100%" stopColor={gradient_to} />
          </linearGradient>
        </defs>
      )}
      {shape_type === "rectangle" && (
        <rect x={2} y={2} width={96} height={96} rx={border_radius ?? 0} fill={fillValue} {...strokeProps} />
      )}
      {shape_type === "ellipse" && <ellipse cx={50} cy={50} rx={48} ry={48} fill={fillValue} {...strokeProps} />}
      {shape_type === "triangle" && <polygon points="50,2 98,98 2,98" fill={fillValue} {...strokeProps} />}
      {shape_type === "line" && (
        <line
          x1={2}
          y1={50}
          x2={98}
          y2={50}
          stroke={stroke !== "none" ? stroke : fillValue}
          strokeWidth={stroke_width}
          {...dashProps}
        />
      )}
      {shape_type === "arrow" && (
        <polygon points="2,40 70,40 70,20 98,50 70,80 70,60 2,60" fill={fillValue} {...strokeProps} />
      )}
      {shape_type === "star" && (
        <polygon points="50,2 61,37 98,37 68,59 79,95 50,73 21,95 32,59 2,37 39,37" fill={fillValue} {...strokeProps} />
      )}
    </svg>
  );
}
