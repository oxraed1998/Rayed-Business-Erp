import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#0b1529" }}>
      <div style={{ width: 120, height: 120, borderRadius: 30, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg,#e2c27d,#b8893a)", color: "#0b1529", fontSize: 84, fontWeight: 800 }}>R</div>
    </div>,
    size,
  );
}
