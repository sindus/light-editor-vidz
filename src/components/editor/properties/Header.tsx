export function Header({
  color,
  icon,
  title,
  subtitle,
}: {
  color: string;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="properties-header">
      <span className="properties-badge" style={{ background: color }}>
        {icon}
      </span>
      <div>
        <div className="properties-title">{title}</div>
        <div className="properties-subtitle">{subtitle}</div>
      </div>
    </div>
  );
}
