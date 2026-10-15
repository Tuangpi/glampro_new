# Rename note — glampro_new to glampro_suite

Updated 2026-10-15. Local folder is already glampro_suite. Branding is being
updated to Glampro Suite; the reported database rename is not verified.

## Local folder and Git

Moving the folder with its .git directory intact does not rewrite Git history,
change tracked relative filenames, rename branches or update origin. No index
repair or force-push is needed solely for a folder rename. Working-tree deletions
are actual deletions, not stale paths caused by renaming the containing folder.
Audit absolute paths in local tools separately; preserve existing user changes.

## GitHub repository — completed 2026-10-15

Official reference: GitHub Docs, Renaming a repository:
`https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository`
And Managing remote repositories:
`https://docs.github.com/en/get-started/git-basics/managing-remote-repositories`

Rename the repository in GitHub Settings using the repository-name Rename control
with appropriate permissions. If already renamed, verify owner and new name first.
Then update this clone's origin (local configuration, not production deployment):

```bash
git -C /home/tuangpi/Documents/Aridient/Glampros/glampro_suite remote set-url origin git@github.com:Tuangpi/glampro_suite.git
git -C /home/tuangpi/Documents/Aridient/Glampros/glampro_suite remote -v
git -C /home/tuangpi/Documents/Aridient/Glampros/glampro_suite ls-remote origin
```

Changing origin does not rename the repository on GitHub. Pushing is not a rename
operation and is not needed merely to update the local URL. Update other clones
and integrations separately. Check GitHub Docs for redirect exceptions.
If reverting, rename back on GitHub if needed and reset origin to its previous
URL. Do not use pull/reset to undo branding or recover deleted files.

## Database is independent

Renaming a database does not affect Git history, but connection strings, scripts,
services and backups may depend on its name. Verify environment, data preservation
and secret-safe configuration before changes. Do not reset/reseed or rewrite
applied migrations merely to rename a database.

## Current status

User confirmed the GitHub-side rename on 2026-10-15. GitHub's public repository
API now reports full_name Tuangpi/glampro_suite with the same repository ID
1396845545, confirming repository identity was preserved.

Updated this clone's origin to git@github.com:Tuangpi/glampro_suite.git.
Verified the configured URL and SSH ls-remote origin HEAD (exit 0), returning
fb823d4d2cc5b56c2e7d6260bc7ef2b809105459. SETUP-04 is complete for this clone;
other clones and external integrations must be checked separately if present.
No database changes, commit or push performed. Branding needs validation.
