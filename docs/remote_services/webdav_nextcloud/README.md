# Nextcloud

## Link

<https://nextcloud.com/>

## Steps

1. Install, or find a hosted version. 
    * The docker version <https://github.com/nextcloud/docker> for internal network, and [Caddy as reverse proxy](https://caddyserver.com/docs/quick-starts/reverse-proxy) (for https), are personally recommended.
    * If you find installing Nextcloud by yourselves is difficult, you can find some "Nextcloud's trusted, certified providers" on [Nextcloud Sign up page](https://nextcloud.com/sign-up/); For example, [The Good Cloud](https://thegood.cloud/) there generously provides 2 GB free stoarage space.
    * Remotely Save is tested to be working with the docker version and The Good Cloud.
2. Go to Nextcloud's settings. Find the webdav url (something like `https://cloud.example.com/remote.php/dav/files/USERNAME`). Use this (without tailing slash), and your account and your password, in Remotely Save.

## Restricted Access

In case one would like to restrict `remotely-save` access to only the Notes folder or any particular folder (for various security concern), he/she can leverage the share functionality of Nextcloud to do so.

## Steps

1. Select your [Obsidian](https://obsidian.md/) folder that you would like to sync with `remotely-save`.
2. Under options, select `Send/Share`.
3. Then, click on <kbd>Share</kbd>.
4. Click on <kbd>+</kbd> icon to create a share link.
5. Remember the part after `s/...` in the link as it will be your username. Better is to copy the url and keep it somewhere safe. We will need it later.
6. Click on the options of the newly created link.
7. Click on `Settings`.
9. Choose the option of `Allow upload and editing`.
10. Enable `Set Password` and enter a new password for this folder. Remember the password as you will need it later.
11. Click on <kbd>Share and Copy Link</kbd>.
12. Now, open the settings section of `remotely-save` in your [Obsidian](https://obsidian.md/) app.
13. Enter the webdav url (something like `https://cloud.example.com/public.php/webdav`) under `Server Address`.
14. Enter the user name from step 5 under `Username`.
15. Enter the password from step 10 under `Password`.
16. Keep the `Auth Type` as basic.

That's it! You have now configured `remotely-save` and restricted the app to only one folder instead of your whole Nextcloud instance.
