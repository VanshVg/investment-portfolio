import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { Pagination } from '@/components/ui/Pagination'
import { SECTION_LEAD, SECTION_TITLE } from '@/components/ui/styles'
import { listFailedMessages, listRecentMessages, listReplies } from '@/lib/queries/messages'
import { pageHref, parsePage } from '@/lib/queries/paging'
import { MessageTable } from './_components/MessageTable'
import { ReplyList } from './_components/ReplyList'
import { markReplyHandled } from './actions'

export const metadata = { title: 'Messages' }

/**
 * Each section pages on its own, with its own parameter, so paging through
 * Recent does not send Replies back to its first page.
 */
const SECTIONS = {
  failed: { param: 'failedPage', anchor: 'needs-attention', pageSize: 25 },
  replies: { param: 'repliesPage', anchor: 'replies', pageSize: 25 },
  recent: { param: 'recentPage', anchor: 'recent', pageSize: 50 },
} as const

const COUNT =
  'ml-2 rounded-full bg-paper px-2 py-0.5 align-middle font-sans text-[11px] font-medium text-ink-soft'

/** How many in the whole list, not just on this page. */
function Count({ total }: { total: number }) {
  if (total === 0) return null
  return (
    <span className={COUNT}>
      {total}
    </span>
  )
}

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  const supabase = await createServerSupabase()
  const request = (section: keyof typeof SECTIONS) => ({
    page: parsePage(params[SECTIONS[section].param]),
    pageSize: SECTIONS[section].pageSize,
  })
  const [failed, replies, recent] = await Promise.all([
    listFailedMessages(supabase, request('failed')),
    listReplies(supabase, request('replies')),
    listRecentMessages(supabase, request('recent')),
  ])
  const href = (section: keyof typeof SECTIONS) => (page: number) =>
    pageHref('/messages', params, SECTIONS[section].param, page, SECTIONS[section].anchor)

  return (
    <div>
      <PageHeader
        title="Messages"
        description="WhatsApp reminders sent, the ones that could not be, and clients' replies."
      />

      <section id={SECTIONS.failed.anchor} className="scroll-mt-4">
        <h2 className={SECTION_TITLE}>
          Needs attention
          <Count total={failed.total} />
        </h2>
        <p className={SECTION_LEAD}>
          Reminders WhatsApp could not deliver in the last 30 days. The client was not reminded.
        </p>
        <MessageTable rows={failed.rows} emptyMessage="Nothing failed in the last 30 days." />
        <Pagination {...failed} href={href('failed')} label="Failed messages" />
      </section>

      <section id={SECTIONS.replies.anchor} className="mt-10 scroll-mt-4">
        <h2 className={SECTION_TITLE}>
          Replies
          <Count total={replies.total} />
        </h2>
        <p className={SECTION_LEAD}>
          Answer from WhatsApp on your phone, then mark the reply handled here. A reply of STOP
          switches that client&apos;s WhatsApp consent off by itself.
        </p>
        <ReplyList replies={replies.rows} markReplyHandled={markReplyHandled} />
        <Pagination {...replies} href={href('replies')} label="Replies" />
      </section>

      <section id={SECTIONS.recent.anchor} className="mt-10 scroll-mt-4">
        <h2 className={SECTION_TITLE}>
          Recent
          <Count total={recent.total} />
        </h2>
        <p className={SECTION_LEAD}>
          The last 30 days of reminders, including the ones skipped and why.
        </p>
        <MessageTable rows={recent.rows} emptyMessage="No reminders in the last 30 days." />
        <Pagination {...recent} href={href('recent')} label="Recent messages" />
      </section>
    </div>
  )
}
