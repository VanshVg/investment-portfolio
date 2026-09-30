import { createServerSupabase } from '@/lib/supabase/server'
import { PageHeader } from '@/components/ui/PageHeader'
import { SECTION_LEAD, SECTION_TITLE } from '@/components/ui/styles'
import { listFailedMessages, listRecentMessages, listReplies } from '@/lib/queries/messages'
import { MessageTable } from './_components/MessageTable'
import { ReplyList } from './_components/ReplyList'
import { markReplyHandled } from './actions'

export const metadata = { title: 'Messages' }

export default async function MessagesPage() {
  const supabase = await createServerSupabase()
  const [failed, replies, recent] = await Promise.all([
    listFailedMessages(supabase),
    listReplies(supabase),
    listRecentMessages(supabase),
  ])

  return (
    <div>
      <PageHeader
        title="Messages"
        description="WhatsApp reminders sent, the ones that could not be, and clients' replies."
      />

      <section>
        <h2 className={SECTION_TITLE}>Needs attention</h2>
        <p className={SECTION_LEAD}>
          Reminders WhatsApp could not deliver in the last 30 days. The client was not reminded.
        </p>
        <MessageTable rows={failed} emptyMessage="Nothing failed in the last 30 days." />
      </section>

      <section className="mt-10">
        <h2 className={SECTION_TITLE}>Replies</h2>
        <p className={SECTION_LEAD}>
          Answer from WhatsApp on your phone, then mark the reply handled here. A reply of STOP
          switches that client&apos;s WhatsApp consent off by itself.
        </p>
        <ReplyList replies={replies} markReplyHandled={markReplyHandled} />
      </section>

      <section className="mt-10">
        <h2 className={SECTION_TITLE}>Recent</h2>
        <p className={SECTION_LEAD}>
          The last 30 days of reminders, including the ones skipped and why.
        </p>
        <MessageTable rows={recent} emptyMessage="No reminders in the last 30 days." />
      </section>
    </div>
  )
}
