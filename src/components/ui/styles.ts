/**
 * The shared class strings for every control and heading in the app.
 *
 * Each page used to spell these out for itself, and they drifted: three
 * button heights, four input paddings, labels in two sizes and two cases,
 * page titles at 20px on one page and 22px on the next. One definition here
 * is what keeps a button on the settings page looking like a button on the
 * renewals page. Plain strings rather than components, matching how the rest
 * of the codebase composes Tailwind classes.
 *
 * Sizes: `md` is the default for forms and page actions; `sm` is for
 * toolbars and compact editors; `xs` is for controls that sit inside a
 * table row; `lg` is for the sign-in form, the one screen with nothing else
 * on it.
 *
 * Adjust a control by choosing a size, never by appending a competing
 * utility: `h-9` plus `h-10` on one element is settled by stylesheet order,
 * not by which was written last.
 */

export type ControlSize = 'xs' | 'sm' | 'md' | 'lg'

const HEIGHT: Record<ControlSize, string> = {
  xs: 'h-7 px-2.5 text-[12px]',
  sm: 'h-8 px-3 text-[12.5px]',
  md: 'h-9 px-3.5 text-[13px]',
  lg: 'h-10 px-4 text-[14px]',
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-55'

const BUTTON_VARIANT = {
  primary: 'bg-navy text-white hover:bg-navy-deep',
  secondary: 'border border-line-strong bg-white text-ink hover:border-navy/40 hover:bg-paper',
  danger: 'bg-rust text-white hover:bg-[#8a3127]',
  // Row actions and other low-emphasis verbs: no box until hovered.
  quiet: 'text-ink-soft hover:bg-paper hover:text-navy',
} as const

export type ButtonVariant = keyof typeof BUTTON_VARIANT

export function buttonClass(variant: ButtonVariant = 'secondary', size: ControlSize = 'md'): string {
  return `${BUTTON_BASE} ${HEIGHT[size]} ${BUTTON_VARIANT[variant]}`
}

const INPUT_HEIGHT: Record<ControlSize, string> = {
  xs: 'h-7 px-2 text-[12px]',
  sm: 'h-8 px-2.5 text-[12.5px]',
  md: 'h-9 px-2.5 text-[13px]',
  lg: 'h-10 px-3 text-[14px]',
}

/**
 * Text inputs and selects alike, so the two sit level beside each other.
 *
 * Width is a parameter rather than something to append: two width utilities
 * on one element (`w-full` plus `w-40`) are resolved by stylesheet order, not
 * by which was written last, so an appended width silently lost.
 */
export function inputClass(size: ControlSize = 'md', width = 'w-full'): string {
  return `${width} rounded border border-line-strong bg-white text-ink placeholder:text-ink-soft/55 disabled:cursor-not-allowed disabled:bg-paper disabled:text-ink-soft aria-[invalid=true]:border-rust ${INPUT_HEIGHT[size]}`
}

/** The small caps label above every field. */
export const FIELD_LABEL = 'text-[11px] font-medium uppercase tracking-[0.05em] text-ink-soft'

/** A text link used for in-page navigation ("← All families"). */
export const TEXT_LINK = 'text-[12.5px] text-ink-soft hover:text-navy hover:underline'

export const PAGE_TITLE = 'font-serif text-[24px] font-semibold leading-tight text-navy'
export const PAGE_LEAD = 'mt-1 text-[13px] text-ink-soft'
export const SECTION_TITLE = 'font-serif text-[17px] font-semibold text-navy'
export const SECTION_LEAD = 'mt-0.5 text-[12.5px] text-ink-soft'

export const CARD = 'rounded border border-line bg-paper-raised'

/** Table chrome shared by every listing, ledger and settings table. */
export const TABLE = 'w-full border-collapse text-[12.5px]'
export const TABLE_HEAD_ROW =
  'border-b border-line bg-paper/60 text-left text-[11px] uppercase tracking-[0.04em] text-ink-soft'
export const TH = 'whitespace-nowrap px-3 py-2.5 font-medium'
export const TD = 'px-3 py-2.5'
