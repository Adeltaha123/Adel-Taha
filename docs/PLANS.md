# Plans and team roles

Plans, prices, limits, and role rules are defined once in `shared/plans.ts`. The API enforces them; the Account screen shows them.

## Plans

| Plan | Price | Includes |
|---|---|---|
| Free | 0 | Tasks, notes, habits, reminders, the app lock, and sync. 20 AI and voice requests per calendar month (UTC). |
| Personal | 149 EGP / month | Everything in Free with unlimited AI chat and voice transcription. |
| Team | 499 EGP / month | Personal, plus creating teams of up to 10 members (including the owner) with roles and task assignment. Every member of a team whose owner has an active Team plan has unlimited AI. |

An AI or voice request counts only when it succeeds. When a free account reaches its limit, the API answers `402` with `code: "ai_limit"` and the app explains how to upgrade.

Creating a team and inviting people need an active Team plan for the team's owner. If that plan lapses, the team and its tasks keep working, but no one new can be invited and members lose the plan's unlimited AI. Teams created before plans existed keep working the same way.

## Activating a subscription

Payments are not connected yet. After someone pays, run on the PC that holds the database:

```sh
npm run plan                                  # list accounts and plans
npm run plan -- someone@mail.com personal 1   # Personal for 1 month
npm run plan -- someone@mail.com team 3       # Team for 3 months
npm run plan -- someone@mail.com free         # back to Free
```

A month is 30 days. Activating the same plan again extends the current period. Set `SUBSCRIBE_CONTACT` in `.env` (for example `WhatsApp 01xxxxxxxxx`) to tell people on the Account screen whom to contact; restart the server after changing it.

Connecting real payments later: phone apps must sell subscriptions through Apple and Google in-app purchases (RevenueCat can handle both); the website can use a card provider such as Paymob. Each provider's confirmation should call the same `setPlan` used by `npm run plan`.

## Team roles

| Role | Can do |
|---|---|
| Owner | Everything: the plan, all members and roles, all tasks. One per team; cannot leave or be removed. |
| Admin | Invite people as Member or Viewer, change and remove members and viewers, edit and assign any task. Only the owner makes or removes admins. |
| Member | Add tasks and notes, edit or delete what they created or what is assigned to them, and assign tasks only to themselves. |
| Viewer | See the team's tasks; cannot change anything. |

Every member except the owner can leave a team. A removed member's tasks stay with the team.

The server records who created each team record. Records from before roles existed have no creator, and any member may edit them. A change the role does not allow is returned in the sync response's `rejected` list; the app puts back the team's version and explains why, so the change is not retried forever. A viewer sees a notice at the top of the app.
