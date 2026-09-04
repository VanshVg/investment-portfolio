import { BRAND } from '@/config/brand'

/** The masthead identity. Swapping this file rebrands the portal. */
export function Logo({ showText = true }: { showText?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <div
        aria-hidden
        className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[3px] border-[1.5px] border-[#c9b77e] font-serif text-lg font-semibold text-[#e7ddb8]"
      >
        {BRAND.mark}
      </div>
      {showText && (
        <div>
          <p className="font-serif text-[26px] font-semibold tracking-[0.2px] text-white">
            {BRAND.name}
          </p>
          <p className="mt-0.5 text-[12.5px] tracking-[0.03em] text-[#b9c2d6]">
            {BRAND.tagline} — {BRAND.subtitle}
          </p>
        </div>
      )}
    </div>
  )
}
