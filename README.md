# Welcome to your Lovable project

## Project info

**URL**: https://lovable.dev/projects/5db1f5ac-59d7-499f-a96e-22b055c5956d

## How can I edit this code?

There are several ways of editing your application.

**Use Lovable**

Simply visit the [Lovable Project](https://lovable.dev/projects/5db1f5ac-59d7-499f-a96e-22b055c5956d) and start prompting.

Changes made via Lovable will be committed automatically to this repo.

**Use your preferred IDE**

If you want to work locally using your own IDE, you can clone this repo and push changes. Pushed changes will also be reflected in Lovable.

The only requirement is having Node.js & npm installed - [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating)

Follow these steps:

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone <YOUR_GIT_URL>

# Step 2: Navigate to the project directory.
cd <YOUR_PROJECT_NAME>

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

**Edit a file directly in GitHub**

- Navigate to the desired file(s).
- Click the "Edit" button (pencil icon) at the top right of the file view.
- Make your changes and commit the changes.

**Use GitHub Codespaces**

- Navigate to the main page of your repository.
- Click on the "Code" button (green button) near the top right.
- Select the "Codespaces" tab.
- Click on "New codespace" to launch a new Codespace environment.
- Edit files directly within the Codespace and commit and push your changes once you're done.

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## How can I deploy this project?

Simply open [Lovable](https://lovable.dev/projects/5db1f5ac-59d7-499f-a96e-22b055c5956d) and click on Share -> Publish.

## Can I connect a custom domain to my Lovable project?

Yes, you can!

To connect a domain, navigate to Project > Settings > Domains and click Connect Domain.

Read more here: [Setting up a custom domain](https://docs.lovable.dev/features/custom-domain#custom-domain)

## Supabase typed client

If you make changes to the database schema (for example: adding an `is_shuffling` column to `rooms`), regenerate the typed Supabase client so your TypeScript types remain accurate.

Prerequisites: supabase CLI or installed globally `npm install -g supabase`.

1. Make sure you set the `SUPABASE_PROJECT_ID` environment variable for your local machine.
2. Run:

```bash
npm run gen:supabase
```

This writes the updated types to `src/integrations/supabase/types.ts`.

Also apply DB migrations with your Supabase CLI or from the Supabase dashboard.

### Granting admin access

To allow a Supabase user to access Admin features, add an admin role for the user (execute from SQL or Supabase Dashboard SQL Editor):

```sql
INSERT INTO public.user_roles (user_id, role)
VALUES ('<USER_UUID>', 'admin');
```

You can find the user's UUID in the 'auth.users' table or the Supabase dashboard user list.
