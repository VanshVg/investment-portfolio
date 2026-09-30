/**
 * The eye button that shows or hides one password field. Placed inside the
 * field's `relative` wrapper, beside the input rather than inside its label: a
 * label must not wrap another control, and clicking it would focus the field.
 *
 * `name` finishes the accessible name ("Show new password"), so a form with
 * several of these still gives each button a name of its own.
 */
export function PasswordToggle({
  visible,
  onToggle,
  controls,
  name = 'password',
}: {
  visible: boolean
  onToggle: () => void
  /** The id of the input this button shows and hides. */
  controls: string
  name?: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={`${visible ? 'Hide' : 'Show'} ${name}`}
      aria-pressed={visible}
      aria-controls={controls}
      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-ink-soft hover:text-navy focus-visible:outline-2 focus-visible:outline-navy"
    >
      {visible ? <EyeOffIcon /> : <EyeIcon />}
    </button>
  )
}

const ICON_PROPS = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
}

function EyeIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M10.7 5.1A10.7 10.7 0 0 1 12 5c6.4 0 10 7 10 7a18.5 18.5 0 0 1-2.9 3.9M6.5 6.6A18.4 18.4 0 0 0 2 12s3.6 7 10 7a10.5 10.5 0 0 0 4.4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  )
}
