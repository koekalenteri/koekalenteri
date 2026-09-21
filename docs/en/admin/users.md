---
title: Users and access
audience: admin
order: 50
covers:
  - src/pages/admin/UsersPage.tsx
  - src/pages/admin/usersPage/**
sourceHash: e8feff
---

No accounts are created in the calendar: access is granted to an email address, and its holder
logs in either with that address or with a Google account that has the same address. Access is
always per club, and the same person can have a role in several clubs.

## Roles

| Role | What it allows |
| --- | --- |
| *{t:user.roles.secretary}* | creating and running the club's trials: details, entries, messages, start lists and results |
| *{t:user.roles.admin}* | the same as a secretary, and the club's users' roles besides |
| *{t:user.admin}* | SNJ's calendar contact: every club's rights, and the maintenance of clubs, event types and message templates |

A club's administrator cannot edit their own roles, and the application administrator's right is
granted only by another application administrator.

## The user list

**{t:users}** in the admin menu shows the users who have a role in any of the clubs you yourself
have access to. With several clubs, the list is narrowed with *{t:organization}*; the search box
narrows by name or address. The icons in the *{t:roles}* column show administrator status, the
number of club roles, and whether the person is a judge or an official in the Kennel Club's
register; the exact list appears when you hover over the icons. The other columns are the contact
details, *{t:contact.kcEmail}*, the kennel district and *{t:user.lastSeen}*.

## Granting access

The **{t:create}** button opens the dialog **{t:user.createDialog.title}**. It takes
*{t:user.createDialog.organization}*, *{t:user.createDialog.role}*,
*{t:user.createDialog.email}* and *{t:user.createDialog.name}*. When the dialog is saved, the
person gets the email *{t:emailTemplate.access}*, which names the access granted and links to the
calendar. If the address already has a user, the new role is added to it.

## Editing roles

Select a user in the list and press **{t:editRoles}** — or double-click the row. The dialog lists
the user's clubs with their roles. A role is removed with the row's **{t:delete}** button, and a
new one added on the bottom row by picking the club and the role and pressing **{t:add}**. Only
the clubs you administer, and in which the user has no role yet, are offered. Changes take effect
at once, and an added role sends the same email as a new grant.

The application administrator also sees the *{t:user.admin}* option in the dialog. While it is
ticked, no club roles are listed, because the administrator has them in every club.
