import { redirect } from 'next/navigation'

/**
 * The families list is the working surface today. `/` stays a redirect so a
 * dashboard or the renewals page can take it later without breaking bookmarks.
 */
export default function HomePage() {
  redirect('/families')
}
