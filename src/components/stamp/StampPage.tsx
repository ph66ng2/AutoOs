import { BRAND } from "./constants"
import { StampDemo } from "./StampDemo"

export function StampPage() {
  return (
    <main className="page-solo is-boot" style={{ ["--product" as string]: BRAND.color }}>
      <div className="stamp-solo">
        <StampDemo mode="loading" motion="cinematic" sound />
      </div>
    </main>
  )
}
