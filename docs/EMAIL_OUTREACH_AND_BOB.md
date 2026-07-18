# Gmail outreach and IBM Bob setup

This guide turns on Faro's **read-only** email history feature. Faro can then show matched outreach
email beside the related contact and follow-up, and prepare an IBM Bob draft request using a bounded
amount of that context. Faro never sends an email automatically. A person must review a Bob draft
before using it outside Faro.

## Part 1 — Start Faro first

1. Open a terminal in the Faro project folder.
2. Run `docker compose up -d postgres redis`.
3. Wait a few seconds, then run `docker compose ps`. Both services should say `healthy`.
4. Run `pnpm db:deploy`.
5. Run `pnpm dev`.
6. In your browser, open `http://localhost:3000`. Always use this exact address during setup; do
   not switch to `127.0.0.1` or the network address.

## Part 2 — Enable Gmail in Google Cloud

You need to use the same Google Cloud project and OAuth client that you already made for Google
Sheets.

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. At the very top, choose the project that contains your Faro OAuth client.
3. Click the three-line menu in the top left.
4. Click **APIs & Services**, then **Library**.
5. Search for **Gmail API**.
6. Open the result named **Gmail API** and click **Enable**.
7. In the left menu, click **Google Auth platform**, then **Data Access**.
8. Click **Add or remove scopes**.
9. Search for `gmail.readonly` and tick **Gmail API / Read your email messages and settings**
   (`https://www.googleapis.com/auth/gmail.readonly`). Do not select a Gmail scope that can send,
   delete, or change mail.
10. Click **Update**, then **Save**.
11. Click **Audience**. If the app is still in **Testing**, add the Gmail account you will use under
    **Test users**. Click **Save**.
12. Click **Clients**. Open your existing Faro web OAuth client. Confirm its authorized redirect
    URI is exactly:

    ```text
    http://localhost:3000/api/integrations/google-sheets/callback
    ```

    Do not create a second client just for Gmail.

Google may show an "unverified app" or testing warning because `gmail.readonly` is a sensitive
scope. For your own test account, that is expected while your OAuth app is in Testing. Do not add
other people as testers unless you trust them with this test app.

## Part 3 — Reconnect Faro to Google

Your earlier Google consent only included Sheets. You must reconnect once to add the new Gmail
permission.

1. In Faro, open **Google Sheets** from the left sidebar.
2. If it says connected, use your browser's Google account permissions page to remove Faro access,
   or sign out of Faro and reconnect. This makes Google show the updated Gmail permission.
3. Click **Connect Google account**.
4. Select your tester Google account.
5. Read the consent screen. You should see Google Sheets read access and Gmail read-only access.
6. Click **Allow**.
7. After you return to Faro, open **Outreach** in the left sidebar.
8. Click **Refresh Gmail history**.

Faro reads up to 100 messages from the last two years, and imports only messages whose sender or
recipient is already an active Faro contact. It records the import in the audit log. Unmatched
personal email does not become a Faro record.

If OAuth fails, the Outreach page displays clearly labeled fictional Jordan Lee preview data. That
fallback never reads Gmail and cannot send mail.

## Part 4 — Create a campaign before asking Bob for a sponsorship draft

1. Open **Campaigns**.
2. Create a campaign such as `SF Hacks 2027 sponsor outreach`.
3. Use **Associate contacts** to add the relevant imported sponsor contacts.
4. Make sure the contact has a valid email and an outreach basis recorded as **OPTED_IN** or
   **IMPLIED**. Faro will refuse to ask Bob for a draft for unknown, opted-out, or suppressed
   contacts.
5. Go back to **Outreach**, open that contact, and click **Request IBM Bob draft**.

For a newly imported contact marked **UNKNOWN**, Faro shows **Confirm outreach basis & request
draft** instead. Clicking it records **IMPLIED** consent and its audit event, then creates the
draft request in the same action. Use it only when you have a reasonable business basis to contact
that person; opted-out or suppressed contacts remain unavailable for drafting.

You can select a campaign at the top, but it is optional. If you select **No campaign**, Faro
creates and reuses a clearly labeled internal **Unassigned outreach drafts** context record. The
contact does not need to be associated with any campaign. Faro records the exact initialization time
on every Bob request.

When you do select a campaign, the checkbox beneath it controls association separately. Leave it
unchecked to use campaign information only as draft context. Check it to add the contact to that
campaign at the same time as the request.

Faro stores a governed `AWAITING_BOB` request. It includes the selected campaign, contact details,
and at most 20 tracked email interactions for that contact. Email text is untrusted data, not
instructions for Bob.

At the top of the **Outreach** page is **Context for IBM Bob**. Before clicking the draft button,
type the practical details Bob needs, for example the sponsorship package, event date, desired
meeting length, or a sentence you do not want the email to claim. This context applies to the next
draft request only. Faro labels it as untrusted reference material and Bob may not treat it as a
tool instruction.

## Part 5 — Have Faro call IBM Bob automatically from your computer

You do **not** need to open IBM Bob IDE for each email. Faro can run the installed IBM Bob Shell
from your local computer, send it the governed context, and put the returned subject and body on the
same Outreach card.

1. Install Bob Shell once, if you have not already:

   ```bash
   curl -fsSL https://bob.ibm.com/download/bobshell.sh | bash -s -- --pm npm
   ```

2. In the IBM Bob web dashboard, create or use an active **Inference** API key. This is not the
   Bob IDE MCP setting.
3. In Faro's ignored repository-root `.env`, add your key (never commit it):

   ```dotenv
   BOBSHELL_API_KEY="paste-your-IBM-Bob-Inference-key-here"
   BOB_RUNTIME_ADAPTER="bob-shell"
   ```

4. Stop the Faro server with `Ctrl+C`, then start it again with `pnpm dev`. Restarting is required
   because the server reads `.env` when it starts.
5. Open **Outreach**, optionally choose a campaign and add context at the top, then click **Request
   IBM Bob draft** on any eligible contact.
6. Faro shows an in-place loading state. When Bob succeeds, the same expanded contact shows the
   generated **Subject** and email body. It also records when the request was initialized.

If Bob Shell is missing, its key is invalid, or Bob returns invalid draft data, Faro marks that
request as failed and leaves any existing data unchanged. It never sends an email; the returned
draft still requires your review before use.

## What Faro does and does not do

| Faro does                                                  | Faro does not do                               |
| ---------------------------------------------------------- | ---------------------------------------------- |
| Read matched Gmail messages with `gmail.readonly`          | Send, delete, label, or archive Gmail messages |
| Save bounded message text against existing contacts        | Import every personal email into your CRM      |
| Give IBM Bob approved contact, campaign, and email context | Let Bob use email content as tool instructions |
| Create a reviewable draft request                          | Claim that a draft was sent                    |
