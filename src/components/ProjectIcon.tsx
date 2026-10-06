import { typeInfo } from "@/lib/constants";

export default function ProjectIcon({
  url,
  title,
  type,
  size = 64,
}: {
  url: string | null;
  title: string;
  type: string;
  size?: number;
}) {
  const style = { width: size, height: size };
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" style={style} className="shrink-0 rounded-xl border border-line object-cover" />;
  }
  const hue = [...title].reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
  return (
    <div
      style={{ ...style, background: `hsl(${hue} 45% 28%)`, fontSize: size * 0.42 }}
      className="grid shrink-0 place-items-center rounded-xl border border-line font-black text-white/90"
      title={typeInfo(type).label}
    >
      {title.charAt(0).toUpperCase()}
    </div>
  );
}
