import {
  App,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  Platform,
  requireApiVersion,
  requestUrl,
} from "obsidian";
import type { TextComponent } from "obsidian";
import { createElement, Eye, EyeOff } from "lucide";
import {
  API_VER_ENSURE_REQURL_OK,
  API_VER_REQURL,
  ConflictActionType,
  DEFAULT_DEBUG_FOLDER,
  EmptyFolderCleanType,
  SUPPORTED_SERVICES_TYPE,
  SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR,
  SyncDirectionType,
  VALID_REQURL,
  WebdavAuthType,
  WebdavDepthType,
  CipherMethodType,
} from "./baseTypes";
import { exportVaultSyncPlansToFiles } from "./debugMode";
import { exportQrCodeUri } from "./importExport";
import {
  clearAllPrevSyncRecordByVault,
  clearAllSyncPlanRecords,
  destroyDBs,
  upsertLastSuccessSyncTimeByVault,
} from "./localdb";
import type RemotelySavePlugin from "./main"; // unavoidable
import { RemoteClient } from "./remote";
import {
  DEFAULT_DROPBOX_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierDropbox,
  sendAuthReq as sendAuthReqDropbox,
  setConfigBySuccessfullAuthInplace,
} from "./remoteForDropbox";
import {
  DEFAULT_ONEDRIVE_CONFIG,
  getAuthUrlAndVerifier as getAuthUrlAndVerifierOnedrive,
} from "./remoteForOnedrive";
import { messyConfigToNormal } from "./configPersist";
import type { TransItemType } from "./i18n";
import {
  changeMobileStatusBar,
  checkHasSpecialCharForDir,
  stringToFragment,
} from "./misc";
import { simpleTransRemotePrefix } from "./remoteForS3";

class PasswordModal extends Modal {
  plugin: RemotelySavePlugin;
  newPassword: string;
  constructor(app: App, plugin: RemotelySavePlugin, newPassword: string) {
    super(app);
    this.plugin = plugin;
    this.newPassword = newPassword;
  }

  onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    // contentEl.setText("Add Or change password.");
    contentEl.createEl("h2", { text: t("modal_password_title") });
    t("modal_password_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    [
      t("modal_password_attn1"),
      t("modal_password_attn2"),
      t("modal_password_attn3"),
      t("modal_password_attn4"),
      t("modal_password_attn5"),
    ].forEach((val, idx) => {
      if (idx < 3) {
        contentEl.createEl("p", {
          text: val,
          cls: "password-disclaimer",
        });
      } else {
        contentEl.createEl("p", {
          text: val,
        });
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("modal_password_secondconfirm"));
        button.onClick(async () => {
          this.plugin.settings.password = this.newPassword;
          await this.plugin.saveSettings();
          new Notice(t("modal_password_notice"));
          this.close();
        });
        button.setClass("password-second-confirm");
      })
      .addButton((button) => {
        button.setButtonText(t("goback"));
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class EncryptionMethodModal extends Modal {
  plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    // contentEl.setText("Add Or change password.");
    contentEl.createEl("h2", { text: t("modal_encryptionmethod_title") });
    t("modal_encryptionmethod_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: stringToFragment(val),
        });
      });

    new Setting(contentEl).addButton((button) => {
      button.setButtonText(t("confirm"));
      button.onClick(async () => {
        this.close();
      });
      button.setClass("encryptionmethod-second-confirm");
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class ChangeRemoteBaseDirModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly newRemoteBaseDir: string;
  readonly service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    newRemoteBaseDir: string,
    service: SUPPORTED_SERVICES_TYPE_WITH_REMOTE_BASE_DIR
  ) {
    super(app);
    this.plugin = plugin;
    this.newRemoteBaseDir = newRemoteBaseDir;
    this.service = service;
  }

  onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", { text: t("modal_remotebasedir_title") });
    t("modal_remotebasedir_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    if (
      this.newRemoteBaseDir === "" ||
      this.newRemoteBaseDir === this.app.vault.getName()
    ) {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(
            t("modal_remotebasedir_secondconfirm_vaultname")
          );
          button.onClick(async () => {
            // in the settings, the value is reset to the special case ""
            this.plugin.settings[this.service].remoteBaseDir = "";
            await this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });
          button.setClass("remotebasedir-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    } else if (checkHasSpecialCharForDir(this.newRemoteBaseDir)) {
      contentEl.createEl("p", {
        text: t("modal_remotebasedir_invaliddirhint"),
      });
      new Setting(contentEl).addButton((button) => {
        button.setButtonText(t("goback"));
        button.onClick(() => {
          this.close();
        });
      });
    } else {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(t("modal_remotebasedir_secondconfirm_change"));
          button.onClick(async () => {
            this.plugin.settings[this.service].remoteBaseDir =
              this.newRemoteBaseDir;
            await this.plugin.saveSettings();
            new Notice(t("modal_remotebasedir_notice"));
            this.close();
          });
          button.setClass("remotebasedir-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    }
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

/**
 * s3 is special and do not necessarily the same as others
 * thus a new Modal here
 */
class ChangeRemotePrefixModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly newRemotePrefix: string;
  constructor(app: App, plugin: RemotelySavePlugin, newRemotePrefix: string) {
    super(app);
    this.plugin = plugin;
    this.newRemotePrefix = newRemotePrefix;
  }

  onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("h2", { text: t("modal_remoteprefix_title") });
    t("modal_remoteprefix_shortdesc")
      .split("\n")
      .forEach((val, idx) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    contentEl.createEl("p", {
      text: t("modal_remoteprefix_tosave", { prefix: this.newRemotePrefix }),
    });

    if (
      this.newRemotePrefix === "" ||
      this.newRemotePrefix === this.app.vault.getName()
    ) {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(t("modal_remoteprefix_secondconfirm_empty"));
          button.onClick(async () => {
            // in the settings, the value is reset to the special case ""
            this.plugin.settings.s3.remotePrefix = "";
            await this.plugin.saveSettings();
            new Notice(t("modal_remoteprefix_notice"));
            this.close();
          });
          button.setClass("remoteprefix-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    } else {
      new Setting(contentEl)
        .addButton((button) => {
          button.setButtonText(t("modal_remoteprefix_secondconfirm_change"));
          button.onClick(async () => {
            this.plugin.settings.s3.remotePrefix = this.newRemotePrefix;
            await this.plugin.saveSettings();
            new Notice(t("modal_remoteprefix_notice"));
            this.close();
          });
          button.setClass("remoteprefix-second-confirm");
        })
        .addButton((button) => {
          button.setButtonText(t("goback"));
          button.onClick(() => {
            this.close();
          });
        });
    }
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class DropboxAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
  }

  async onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    let needManualPatse = false;
    const userAgent = window.navigator.userAgent.toLocaleLowerCase() || "";
    // some users report that,
    // the Linux would open another instance Obsidian if jumping back,
    // so fallback to manual paste on Linux
    if (
      Platform.isDesktopApp &&
      !Platform.isMacOS &&
      (/linux/.test(userAgent) ||
        /ubuntu/.test(userAgent) ||
        /debian/.test(userAgent) ||
        /fedora/.test(userAgent) ||
        /centos/.test(userAgent))
    ) {
      needManualPatse = true;
    }

    const { authUrl, verifier } = await getAuthUrlAndVerifierDropbox(
      this.plugin.settings.dropbox.clientID,
      needManualPatse
    );

    if (needManualPatse) {
      t("modal_dropboxauth_manualsteps")
        .split("\n")
        .forEach((val) => {
          contentEl.createEl("p", {
            text: val,
          });
        });
    } else {
      this.plugin.oauth2Info.verifier = verifier;

      t("modal_dropboxauth_autosteps")
        .split("\n")
        .forEach((val) => {
          contentEl.createEl("p", {
            text: val,
          });
        });
    }

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_dropboxauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_dropboxauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });

    if (needManualPatse) {
      let authCode = "";
      new Setting(contentEl)
        .setName(t("modal_dropboxauth_maualinput"))
        .setDesc(t("modal_dropboxauth_maualinput_desc"))
        .addText((text) =>
          text
            .setPlaceholder("")
            .setValue("")
            .onChange((val) => {
              authCode = val.trim();
            })
        )
        .addButton(async (button) => {
          button.setButtonText(t("submit"));
          button.onClick(async () => {
            new Notice(t("modal_dropboxauth_maualinput_notice"));
            try {
              const authRes = await sendAuthReqDropbox(
                this.plugin.settings.dropbox.clientID,
                verifier,
                authCode,
                async (e: any) => {
                  new Notice(t("protocol_dropbox_connect_fail"));
                  new Notice(`${e}`);
                  throw e;
                }
              );
              const self = this;
              setConfigBySuccessfullAuthInplace(
                this.plugin.settings.dropbox,
                authRes!,
                () => self.plugin.saveSettings()
              );
              const client = new RemoteClient(
                "dropbox",
                undefined,
                undefined,
                this.plugin.settings.dropbox,
                undefined,
                this.app.vault.getName(),
                () => self.plugin.saveSettings()
              );
              const username = await client.getUser();
              this.plugin.settings.dropbox.username = username;
              await this.plugin.saveSettings();
              new Notice(
                t("modal_dropboxauth_maualinput_conn_succ", {
                  username: username,
                })
              );
              this.authDiv.toggleClass(
                "dropbox-auth-button-hide",
                this.plugin.settings.dropbox.username !== ""
              );
              this.revokeAuthDiv.toggleClass(
                "dropbox-revoke-auth-button-hide",
                this.plugin.settings.dropbox.username === ""
              );
              this.revokeAuthSetting.setDesc(
                t("modal_dropboxauth_maualinput_conn_succ_revoke", {
                  username: this.plugin.settings.dropbox.username,
                })
              );
              this.close();
            } catch (err) {
              console.error(err);
              new Notice(t("modal_dropboxauth_maualinput_conn_fail"));
            }
          });
        });
    }
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  readonly revokeAuthSetting: Setting;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement,
    revokeAuthSetting: Setting
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
    this.revokeAuthSetting = revokeAuthSetting;
  }

  async onOpen() {
    let { contentEl } = this;

    const { authUrl, verifier } = await getAuthUrlAndVerifierOnedrive(
      this.plugin.settings.onedrive.clientID,
      this.plugin.settings.onedrive.authority
    );
    this.plugin.oauth2Info.verifier = verifier;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    t("modal_onedriveauth_shortdesc")
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", {
          text: val,
        });
      });
    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_onedriveauth_copybutton"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(authUrl);
          new Notice(t("modal_onedriveauth_copynotice"));
        };
      }
    );

    contentEl.createEl("p").createEl("a", {
      href: authUrl,
      text: authUrl,
    });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

export class OnedriveRevokeAuthModal extends Modal {
  readonly plugin: RemotelySavePlugin;
  readonly authDiv: HTMLDivElement;
  readonly revokeAuthDiv: HTMLDivElement;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    authDiv: HTMLDivElement,
    revokeAuthDiv: HTMLDivElement
  ) {
    super(app);
    this.plugin = plugin;
    this.authDiv = authDiv;
    this.revokeAuthDiv = revokeAuthDiv;
  }

  async onOpen() {
    let { contentEl } = this;
    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    contentEl.createEl("p", {
      text: t("modal_onedriverevokeauth_step1"),
    });
    const consentUrl = "https://microsoft.com/consent";
    contentEl.createEl("p").createEl("a", {
      href: consentUrl,
      text: consentUrl,
    });

    contentEl.createEl("p", {
      text: t("modal_onedriverevokeauth_step2"),
    });

    new Setting(contentEl)
      .setName(t("modal_onedriverevokeauth_clean"))
      .setDesc(t("modal_onedriverevokeauth_clean_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("modal_onedriverevokeauth_clean_button"));
        button.onClick(async () => {
          try {
            this.plugin.settings.onedrive = JSON.parse(
              JSON.stringify(DEFAULT_ONEDRIVE_CONFIG)
            );
            await this.plugin.saveSettings();
            this.authDiv.toggleClass(
              "onedrive-auth-button-hide",
              this.plugin.settings.onedrive.username !== ""
            );
            this.revokeAuthDiv.toggleClass(
              "onedrive-revoke-auth-button-hide",
              this.plugin.settings.onedrive.username === ""
            );
            new Notice(t("modal_onedriverevokeauth_clean_notice"));
            this.close();
          } catch (err) {
            console.error(err);
            new Notice(t("modal_onedriverevokeauth_clean_fail"));
          }
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class SyncConfigDirModal extends Modal {
  plugin: RemotelySavePlugin;
  saveDropdownFunc: () => void;
  constructor(
    app: App,
    plugin: RemotelySavePlugin,
    saveDropdownFunc: () => void
  ) {
    super(app);
    this.plugin = plugin;
    this.saveDropdownFunc = saveDropdownFunc;
  }

  async onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    t("modal_syncconfig_attn")
      .split("\n")
      .forEach((val) => {
        contentEl.createEl("p", {
          text: val,
        });
      });

    new Setting(contentEl)
      .addButton((button) => {
        button.setButtonText(t("modal_syncconfig_secondconfirm"));
        button.onClick(async () => {
          this.plugin.settings.syncConfigDir = true;
          await this.plugin.saveSettings();
          this.saveDropdownFunc();
          new Notice(t("modal_syncconfig_notice"));
          this.close();
        });
      })
      .addButton((button) => {
        button.setButtonText(t("goback"));
        button.onClick(() => {
          this.close();
        });
      });
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

class ExportSettingsQrCodeModal extends Modal {
  plugin: RemotelySavePlugin;
  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app);
    this.plugin = plugin;
  }

  async onOpen() {
    let { contentEl } = this;

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    const { rawUri, imgUri } = await exportQrCodeUri(
      this.plugin.settings,
      this.app.vault.getName(),
      this.plugin.manifest.version
    );

    const div1 = contentEl.createDiv();
    t("modal_qr_shortdesc")
      .split("\n")
      .forEach((val) => {
        div1.createEl("p", {
          text: val,
        });
      });

    const div2 = contentEl.createDiv();
    div2.createEl(
      "button",
      {
        text: t("modal_qr_button"),
      },
      (el) => {
        el.onclick = async () => {
          await navigator.clipboard.writeText(rawUri);
          new Notice(t("modal_qr_button_notice"));
        };
      }
    );

    const div3 = contentEl.createDiv();
    div3.createEl(
      "img",
      {
        cls: "qrcode-img",
      },
      async (el) => {
        el.src = imgUri;
      }
    );
  }

  onClose() {
    let { contentEl } = this;
    contentEl.empty();
  }
}

const getEyesElements = () => {
  const eyeEl = createElement(Eye);
  const eyeOffEl = createElement(EyeOff);
  return {
    eye: eyeEl.outerHTML,
    eyeOff: eyeOffEl.outerHTML,
  };
};

const wrapTextWithPasswordHide = (text: TextComponent) => {
  const { eye, eyeOff } = getEyesElements();
  const hider = text.inputEl.insertAdjacentElement("afterend", createSpan())!;
  // the init type of hider is "hidden" === eyeOff === password
  hider.innerHTML = eyeOff;
  hider.addEventListener("click", (e) => {
    const isText = text.inputEl.getAttribute("type") === "text";
    hider.innerHTML = isText ? eyeOff : eye;
    text.inputEl.setAttribute("type", isText ? "password" : "text");
    text.inputEl.focus();
  });

  // the init type of text el is password
  text.inputEl.setAttribute("type", "password");
  return text;
};

export class RemotelySaveSettingTab extends PluginSettingTab {
  readonly plugin: RemotelySavePlugin;

  constructor(app: App, plugin: RemotelySavePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    let { containerEl } = this;

    containerEl.empty();

    const t = (x: TransItemType, vars?: any) => {
      return this.plugin.i18n.t(x, vars);
    };

    containerEl.createEl("h1", { text: "Remotely Save" });

    //////////////////////////////////////////////////
    // below for service chooser (part 1/2)
    //////////////////////////////////////////////////

    // we need to create the div in advance of any other service divs
    const serviceChooserDiv = containerEl.createDiv();
    serviceChooserDiv.createEl("h2", { text: t("settings_chooseservice") });

    //////////////////////////////////////////////////
    // below for s3
    //////////////////////////////////////////////////

    const s3Div = containerEl.createEl("div", { cls: "s3-hide" });
    s3Div.toggleClass("s3-hide", this.plugin.settings.serviceType !== "s3");
    s3Div.createEl("h2", { text: t("settings_s3") });

    const s3LongDescDiv = s3Div.createEl("div", { cls: "settings-long-desc" });

    for (const c of [
      t("settings_s3_disclaimer1"),
      t("settings_s3_disclaimer2"),
    ]) {
      s3LongDescDiv.createEl("p", {
        text: c,
        cls: "s3-disclaimer",
      });
    }

    if (!VALID_REQURL) {
      s3LongDescDiv.createEl("p", {
        text: t("settings_s3_cors"),
      });
    }

    s3LongDescDiv.createEl("p", {
      text: t("settings_s3_prod"),
    });

    const s3LinksUl = s3LongDescDiv.createEl("ul");

    s3LinksUl.createEl("li").createEl("a", {
      href: "https://docs.aws.amazon.com/general/latest/gr/s3.html",
      text: t("settings_s3_prod1"),
    });

    s3LinksUl.createEl("li").createEl("a", {
      href: "https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/getting-your-credentials.html",
      text: t("settings_s3_prod2"),
    });

    if (!VALID_REQURL) {
      s3LinksUl.createEl("li").createEl("a", {
        href: "https://docs.aws.amazon.com/AmazonS3/latest/userguide/enabling-cors-examples.html",
        text: t("settings_s3_prod3"),
      });
    }

    new Setting(s3Div)
      .setName(t("settings_s3_endpoint"))
      .setDesc(t("settings_s3_endpoint"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.s3.s3Endpoint)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Endpoint = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName(t("settings_s3_region"))
      .setDesc(t("settings_s3_region_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3Region}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3Region = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName(t("settings_s3_accesskeyid"))
      .setDesc(t("settings_s3_accesskeyid_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3AccessKeyID}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3AccessKeyID = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(s3Div)
      .setName(t("settings_s3_secretaccesskey"))
      .setDesc(t("settings_s3_secretaccesskey_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3SecretAccessKey}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3SecretAccessKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(s3Div)
      .setName(t("settings_s3_bucketname"))
      .setDesc(t("settings_s3_bucketname"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.s3.s3BucketName}`)
          .onChange(async (value) => {
            this.plugin.settings.s3.s3BucketName = value.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(s3Div)
      .setName(t("settings_s3_urlstyle"))
      .setDesc(t("settings_s3_urlstyle_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption(
          "virtualHostedStyle",
          "Virtual Hosted-Style (default)"
        );
        dropdown.addOption("pathStyle", "Path-Style");
        dropdown
          .setValue(
            this.plugin.settings.s3.forcePathStyle
              ? "pathStyle"
              : "virtualHostedStyle"
          )
          .onChange(async (val: string) => {
            this.plugin.settings.s3.forcePathStyle = val === "pathStyle";
            await this.plugin.saveSettings();
          });
      });

    if (VALID_REQURL && !requireApiVersion(API_VER_ENSURE_REQURL_OK)) {
      new Setting(s3Div)
        .setName(t("settings_s3_bypasscorslocally"))
        .setDesc(t("settings_s3_bypasscorslocally_desc"))
        .addDropdown((dropdown) => {
          dropdown
            .addOption("disable", t("disable"))
            .addOption("enable", t("enable"));

          dropdown
            .setValue(
              `${
                this.plugin.settings.s3.bypassCorsLocally ? "enable" : "disable"
              }`
            )
            .onChange(async (value) => {
              if (value === "enable") {
                this.plugin.settings.s3.bypassCorsLocally = true;
              } else {
                this.plugin.settings.s3.bypassCorsLocally = false;
              }
              await this.plugin.saveSettings();
            });
        });
    }

    new Setting(s3Div)
      .setName(t("settings_s3_parts"))
      .setDesc(t("settings_s3_parts_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1");
        dropdown.addOption("2", "2");
        dropdown.addOption("3", "3");
        dropdown.addOption("5", "5");
        dropdown.addOption("10", "10");
        dropdown.addOption("15", "15");
        dropdown.addOption("20", "20 (default)");

        dropdown
          .setValue(`${this.plugin.settings.s3.partsConcurrency}`)
          .onChange(async (val) => {
            const realVal = parseInt(val);
            this.plugin.settings.s3.partsConcurrency = realVal;
            await this.plugin.saveSettings();
          });
      });

    new Setting(s3Div)
      .setName(t("settings_s3_accuratemtime"))
      .setDesc(t("settings_s3_accuratemtime_desc"))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("disable", t("disable"))
          .addOption("enable", t("enable"));

        dropdown
          .setValue(
            `${this.plugin.settings.s3.useAccurateMTime ? "enable" : "disable"}`
          )
          .onChange(async (val) => {
            if (val === "enable") {
              this.plugin.settings.s3.useAccurateMTime = true;
            } else {
              this.plugin.settings.s3.useAccurateMTime = false;
            }
            await this.plugin.saveSettings();
          });
      });

    let newS3RemotePrefix = this.plugin.settings.s3.remotePrefix || "";
    new Setting(s3Div)
      .setName(t("settings_remoteprefix"))
      .setDesc(t("settings_remoteprefix_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(newS3RemotePrefix)
          .onChange((value) => {
            newS3RemotePrefix = simpleTransRemotePrefix(value.trim());
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemotePrefixModal(
            this.app,
            this.plugin,
            simpleTransRemotePrefix(newS3RemotePrefix.trim())
          ).open();
        });
      });

    new Setting(s3Div)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const client = new RemoteClient("s3", this.plugin.settings.s3);
          const errors = { msg: "" };
          const res = await client.checkConnectivity((err: any) => {
            errors.msg = err;
          });
          if (res) {
            new Notice(t("settings_s3_connect_succ"));
          } else {
            new Notice(t("settings_s3_connect_fail"));
            new Notice(errors.msg);
          }
        });
      });

    //////////////////////////////////////////////////
    // below for dropbpx
    //////////////////////////////////////////////////

    const dropboxDiv = containerEl.createEl("div", { cls: "dropbox-hide" });
    dropboxDiv.toggleClass(
      "dropbox-hide",
      this.plugin.settings.serviceType !== "dropbox"
    );
    dropboxDiv.createEl("h2", { text: t("settings_dropbox") });

    const dropboxLongDescDiv = dropboxDiv.createEl("div", {
      cls: "settings-long-desc",
    });
    for (const c of [
      t("settings_dropbox_disclaimer1"),
      t("settings_dropbox_disclaimer2"),
    ]) {
      dropboxLongDescDiv.createEl("p", {
        text: c,
        cls: "dropbox-disclaimer",
      });
    }
    dropboxLongDescDiv.createEl("p", {
      text: t("settings_dropbox_folder", {
        pluginID: this.plugin.manifest.id,
        remoteBaseDir:
          this.plugin.settings.dropbox.remoteBaseDir ||
          this.app.vault.getName(),
      }),
    });

    const dropboxSelectAuthDiv = dropboxDiv.createDiv();
    const dropboxAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-auth-button-hide settings-auth-related",
    });
    const dropboxRevokeAuthDiv = dropboxSelectAuthDiv.createDiv({
      cls: "dropbox-revoke-auth-button-hide settings-auth-related",
    });

    const dropboxRevokeAuthSetting = new Setting(dropboxRevokeAuthDiv)
      .setName(t("settings_dropbox_revoke"))
      .setDesc(
        t("settings_dropbox_revoke_desc", {
          username: this.plugin.settings.dropbox.username,
        })
      )
      .addButton(async (button) => {
        button.setButtonText(t("settings_dropbox_revoke_button"));
        button.onClick(async () => {
          try {
            const self = this;
            const client = new RemoteClient(
              "dropbox",
              undefined,
              undefined,
              this.plugin.settings.dropbox,
              undefined,
              this.app.vault.getName(),
              () => self.plugin.saveSettings()
            );
            await client.revokeAuth();
            this.plugin.settings.dropbox = JSON.parse(
              JSON.stringify(DEFAULT_DROPBOX_CONFIG)
            );
            await this.plugin.saveSettings();
            dropboxAuthDiv.toggleClass(
              "dropbox-auth-button-hide",
              this.plugin.settings.dropbox.username !== ""
            );
            dropboxRevokeAuthDiv.toggleClass(
              "dropbox-revoke-auth-button-hide",
              this.plugin.settings.dropbox.username === ""
            );
            new Notice(t("settings_dropbox_revoke_notice"));
          } catch (err) {
            console.error(err);
            new Notice(t("settings_dropbox_revoke_noticeerr"));
          }
        });
      });

    new Setting(dropboxRevokeAuthDiv)
      .setName(t("settings_dropbox_clearlocal"))
      .setDesc(t("settings_dropbox_clearlocal_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_dropbox_clearlocal_button"));
        button.onClick(async () => {
          this.plugin.settings.dropbox = JSON.parse(
            JSON.stringify(DEFAULT_DROPBOX_CONFIG)
          );
          await this.plugin.saveSettings();
          dropboxAuthDiv.toggleClass(
            "dropbox-auth-button-hide",
            this.plugin.settings.dropbox.username !== ""
          );
          dropboxRevokeAuthDiv.toggleClass(
            "dropbox-revoke-auth-button-hide",
            this.plugin.settings.dropbox.username === ""
          );
          new Notice(t("settings_dropbox_clearlocal_notice"));
        });
      });

    new Setting(dropboxAuthDiv)
      .setName(t("settings_dropbox_auth"))
      .setDesc(t("settings_dropbox_auth_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_dropbox_auth_button"));
        button.onClick(async () => {
          const modal = new DropboxAuthModal(
            this.app,
            this.plugin,
            dropboxAuthDiv,
            dropboxRevokeAuthDiv,
            dropboxRevokeAuthSetting
          );
          this.plugin.oauth2Info.helperModal = modal;
          this.plugin.oauth2Info.authDiv = dropboxAuthDiv;
          this.plugin.oauth2Info.revokeDiv = dropboxRevokeAuthDiv;
          this.plugin.oauth2Info.revokeAuthSetting = dropboxRevokeAuthSetting;
          modal.open();
        });
      });

    dropboxAuthDiv.toggleClass(
      "dropbox-auth-button-hide",
      this.plugin.settings.dropbox.username !== ""
    );
    dropboxRevokeAuthDiv.toggleClass(
      "dropbox-revoke-auth-button-hide",
      this.plugin.settings.dropbox.username === ""
    );

    let newDropboxRemoteBaseDir =
      this.plugin.settings.dropbox.remoteBaseDir || "";
    new Setting(dropboxDiv)
      .setName(t("settings_remotebasedir"))
      .setDesc(t("settings_remotebasedir_desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(newDropboxRemoteBaseDir)
          .onChange((value) => {
            newDropboxRemoteBaseDir = value.trim();
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemoteBaseDirModal(
            this.app,
            this.plugin,
            newDropboxRemoteBaseDir,
            "dropbox"
          ).open();
        });
      });

    new Setting(dropboxDiv)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const self = this;
          const client = new RemoteClient(
            "dropbox",
            undefined,
            undefined,
            this.plugin.settings.dropbox,
            undefined,
            this.app.vault.getName(),
            () => self.plugin.saveSettings()
          );

          const errors = { msg: "" };
          const res = await client.checkConnectivity((err: any) => {
            errors.msg = `${err}`;
          });
          if (res) {
            new Notice(t("settings_dropbox_connect_succ"));
          } else {
            new Notice(t("settings_dropbox_connect_fail"));
            new Notice(errors.msg);
          }
        });
      });

    //////////////////////////////////////////////////
    // below for onedrive
    //////////////////////////////////////////////////

    const onedriveDiv = containerEl.createEl("div", { cls: "onedrive-hide" });
    onedriveDiv.toggleClass(
      "onedrive-hide",
      this.plugin.settings.serviceType !== "onedrive"
    );
    onedriveDiv.createEl("h2", { text: t("settings_onedrive") });
    const onedriveLongDescDiv = onedriveDiv.createEl("div", {
      cls: "settings-long-desc",
    });
    for (const c of [
      t("settings_onedrive_disclaimer1"),
      t("settings_onedrive_disclaimer2"),
    ]) {
      onedriveLongDescDiv.createEl("p", {
        text: c,
        cls: "onedrive-disclaimer",
      });
    }

    onedriveLongDescDiv.createEl("p", {
      text: t("settings_onedrive_folder", {
        pluginID: this.plugin.manifest.id,
        remoteBaseDir:
          this.plugin.settings.onedrive.remoteBaseDir ||
          this.app.vault.getName(),
      }),
    });

    onedriveLongDescDiv.createEl("p", {
      text: t("settings_onedrive_nobiz"),
    });

    const onedriveSelectAuthDiv = onedriveDiv.createDiv();
    const onedriveAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-auth-button-hide settings-auth-related",
    });
    const onedriveRevokeAuthDiv = onedriveSelectAuthDiv.createDiv({
      cls: "onedrive-revoke-auth-button-hide settings-auth-related",
    });

    const onedriveRevokeAuthSetting = new Setting(onedriveRevokeAuthDiv)
      .setName(t("settings_onedrive_revoke"))
      .setDesc(
        t("settings_onedrive_revoke_desc", {
          username: this.plugin.settings.onedrive.username,
        })
      )
      .addButton(async (button) => {
        button.setButtonText(t("settings_onedrive_revoke_button"));
        button.onClick(async () => {
          new OnedriveRevokeAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv
          ).open();
        });
      });

    new Setting(onedriveAuthDiv)
      .setName(t("settings_onedrive_auth"))
      .setDesc(t("settings_onedrive_auth_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_onedrive_auth_button"));
        button.onClick(async () => {
          const modal = new OnedriveAuthModal(
            this.app,
            this.plugin,
            onedriveAuthDiv,
            onedriveRevokeAuthDiv,
            onedriveRevokeAuthSetting
          );
          this.plugin.oauth2Info.helperModal = modal;
          this.plugin.oauth2Info.authDiv = onedriveAuthDiv;
          this.plugin.oauth2Info.revokeDiv = onedriveRevokeAuthDiv;
          this.plugin.oauth2Info.revokeAuthSetting = onedriveRevokeAuthSetting;
          modal.open();
        });
      });

    onedriveAuthDiv.toggleClass(
      "onedrive-auth-button-hide",
      this.plugin.settings.onedrive.username !== ""
    );
    onedriveRevokeAuthDiv.toggleClass(
      "onedrive-revoke-auth-button-hide",
      this.plugin.settings.onedrive.username === ""
    );

    let newOnedriveRemoteBaseDir =
      this.plugin.settings.onedrive.remoteBaseDir || "";
    new Setting(onedriveDiv)
      .setName(t("settings_remotebasedir"))
      .setDesc(t("settings_remotebasedir_desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(newOnedriveRemoteBaseDir)
          .onChange((value) => {
            newOnedriveRemoteBaseDir = value.trim();
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemoteBaseDirModal(
            this.app,
            this.plugin,
            newOnedriveRemoteBaseDir,
            "onedrive"
          ).open();
        });
      });

    new Setting(onedriveDiv)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const self = this;
          const client = new RemoteClient(
            "onedrive",
            undefined,
            undefined,
            undefined,
            this.plugin.settings.onedrive,
            this.app.vault.getName(),
            () => self.plugin.saveSettings()
          );

          const errors = { msg: "" };
          const res = await client.checkConnectivity((err: any) => {
            errors.msg = `${err}`;
          });
          if (res) {
            new Notice(t("settings_onedrive_connect_succ"));
          } else {
            new Notice(t("settings_onedrive_connect_fail"));
            new Notice(errors.msg);
          }
        });
      });

    //////////////////////////////////////////////////
    // below for webdav
    //////////////////////////////////////////////////

    const webdavDiv = containerEl.createEl("div", { cls: "webdav-hide" });
    webdavDiv.toggleClass(
      "webdav-hide",
      this.plugin.settings.serviceType !== "webdav"
    );

    webdavDiv.createEl("h2", { text: t("settings_webdav") });

    const webdavLongDescDiv = webdavDiv.createEl("div", {
      cls: "settings-long-desc",
    });

    webdavLongDescDiv.createEl("p", {
      text: t("settings_webdav_disclaimer1"),
      cls: "webdav-disclaimer",
    });

    if (!VALID_REQURL) {
      webdavLongDescDiv.createEl("p", {
        text: t("settings_webdav_cors_os"),
      });

      webdavLongDescDiv.createEl("p", {
        text: t("settings_webdav_cors"),
      });
    }

    webdavLongDescDiv.createEl("p", {
      text: t("settings_webdav_folder", {
        remoteBaseDir:
          this.plugin.settings.webdav.remoteBaseDir || this.app.vault.getName(),
      }),
    });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_addr"))
      .setDesc(t("settings_webdav_addr_desc"))
      .addText((text) =>
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.address)
          .onChange(async (value) => {
            this.plugin.settings.webdav.address = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }

            // normally saved
            await this.plugin.saveSettings();
          })
      );

    new Setting(webdavDiv)
      .setName(t("settings_webdav_user"))
      .setDesc(t("settings_webdav_user_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.username)
          .onChange(async (value) => {
            this.plugin.settings.webdav.username = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_password"))
      .setDesc(t("settings_webdav_password_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(this.plugin.settings.webdav.password)
          .onChange(async (value) => {
            this.plugin.settings.webdav.password = value.trim();
            // deprecate auto on 20240116, force to manual_1
            if (
              this.plugin.settings.webdav.depth === "auto" ||
              this.plugin.settings.webdav.depth === "auto_1" ||
              this.plugin.settings.webdav.depth === "auto_infinity" ||
              this.plugin.settings.webdav.depth === "auto_unknown"
            ) {
              this.plugin.settings.webdav.depth = "manual_1";
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_auth"))
      .setDesc(t("settings_webdav_auth_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("basic", "basic");
        if (VALID_REQURL) {
          dropdown.addOption("digest", "digest");
        }

        // new version config, copied to old version, we need to reset it
        if (!VALID_REQURL && this.plugin.settings.webdav.authType !== "basic") {
          this.plugin.settings.webdav.authType = "basic";
          await this.plugin.saveSettings();
        }

        dropdown
          .setValue(this.plugin.settings.webdav.authType)
          .onChange(async (val) => {
            this.plugin.settings.webdav.authType = val as WebdavAuthType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(webdavDiv)
      .setName(t("settings_webdav_depth"))
      .setDesc(t("settings_webdav_depth_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("manual_1", t("settings_webdav_depth_1"));
        dropdown.addOption("manual_infinity", t("settings_webdav_depth_inf"));

        dropdown
          .setValue(this.plugin.settings.webdav.depth || "manual_1")
          .onChange(async (val) => {
            if (val === "manual_1") {
              this.plugin.settings.webdav.depth = "manual_1";
              this.plugin.settings.webdav.manualRecursive = true;
            } else if (val === "manual_infinity") {
              this.plugin.settings.webdav.depth = "manual_infinity";
              this.plugin.settings.webdav.manualRecursive = false;
            }

            // normally save
            await this.plugin.saveSettings();
          });
      });

    let newWebdavRemoteBaseDir =
      this.plugin.settings.webdav.remoteBaseDir || "";
    new Setting(webdavDiv)
      .setName(t("settings_remotebasedir"))
      .setDesc(t("settings_remotebasedir_desc"))
      .addText((text) =>
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(newWebdavRemoteBaseDir)
          .onChange((value) => {
            newWebdavRemoteBaseDir = value.trim();
          })
      )
      .addButton((button) => {
        button.setButtonText(t("confirm"));
        button.onClick(() => {
          new ChangeRemoteBaseDirModal(
            this.app,
            this.plugin,
            newWebdavRemoteBaseDir,
            "webdav"
          ).open();
        });
      });

    new Setting(webdavDiv)
      .setName(t("settings_checkonnectivity"))
      .setDesc(t("settings_checkonnectivity_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_checkonnectivity_button"));
        button.onClick(async () => {
          new Notice(t("settings_checkonnectivity_checking"));
          const self = this;
          const client = new RemoteClient(
            "webdav",
            undefined,
            this.plugin.settings.webdav,
            undefined,
            undefined,
            this.app.vault.getName(),
            () => self.plugin.saveSettings()
          );
          const errors = { msg: "" };
          const res = await client.checkConnectivity((err: any) => {
            errors.msg = `${err}`;
          });
          if (res) {
            new Notice(t("settings_webdav_connect_succ"));
          } else {
            if (VALID_REQURL) {
              new Notice(t("settings_webdav_connect_fail"));
            } else {
              new Notice(t("settings_webdav_connect_fail_withcors"));
            }
            new Notice(errors.msg);
          }
        });
      });

    //////////////////////////////////////////////////
    // below for general chooser (part 2/2)
    //////////////////////////////////////////////////

    // we need to create chooser
    // after all service-div-s being created
    new Setting(serviceChooserDiv)
      .setName(t("settings_chooseservice"))
      .setDesc(t("settings_chooseservice_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("s3", t("settings_chooseservice_s3"));
        dropdown.addOption("dropbox", t("settings_chooseservice_dropbox"));
        dropdown.addOption("webdav", t("settings_chooseservice_webdav"));
        dropdown.addOption("onedrive", t("settings_chooseservice_onedrive"));
        dropdown
          .setValue(this.plugin.settings.serviceType)
          .onChange(async (val) => {
            this.plugin.settings.serviceType = val as SUPPORTED_SERVICES_TYPE;
            s3Div.toggleClass(
              "s3-hide",
              this.plugin.settings.serviceType !== "s3"
            );
            dropboxDiv.toggleClass(
              "dropbox-hide",
              this.plugin.settings.serviceType !== "dropbox"
            );
            onedriveDiv.toggleClass(
              "onedrive-hide",
              this.plugin.settings.serviceType !== "onedrive"
            );
            webdavDiv.toggleClass(
              "webdav-hide",
              this.plugin.settings.serviceType !== "webdav"
            );
            await this.plugin.saveSettings();
          });
      });

    //////////////////////////////////////////////////
    // below for basic settings
    //////////////////////////////////////////////////

    const basicDiv = containerEl.createEl("div");
    basicDiv.createEl("h2", { text: t("settings_basic") });

    let newPassword = `${this.plugin.settings.password}`;
    new Setting(basicDiv)
      .setName(t("settings_password"))
      .setDesc(t("settings_password_desc"))
      .addText((text) => {
        wrapTextWithPasswordHide(text);
        text
          .setPlaceholder("")
          .setValue(`${this.plugin.settings.password}`)
          .onChange(async (value) => {
            newPassword = value.trim();
          });
      })
      .addButton(async (button) => {
        button.setButtonText(t("confirm"));
        button.onClick(async () => {
          new PasswordModal(this.app, this.plugin, newPassword).open();
        });
      });

    new Setting(basicDiv)
      .setName(t("settings_encryptionmethod"))
      .setDesc(stringToFragment(t("settings_encryptionmethod_desc")))
      .addDropdown((dropdown) => {
        dropdown
          .addOption("rclone-base64", t("settings_encryptionmethod_rclone"))
          .addOption("openssl-base64", t("settings_encryptionmethod_openssl"))
          .setValue(this.plugin.settings.encryptionMethod ?? "rclone-base64")
          .onChange(async (val: string) => {
            this.plugin.settings.encryptionMethod = val as CipherMethodType;
            await this.plugin.saveSettings();
            if (this.plugin.settings.password !== "") {
              new EncryptionMethodModal(this.app, this.plugin).open();
            }
          });
      });

    new Setting(basicDiv)
      .setName(t("settings_autorun"))
      .setDesc(t("settings_autorun_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_autorun_notset"));
        dropdown.addOption(`${1000 * 60 * 1}`, t("settings_autorun_1min"));
        dropdown.addOption(`${1000 * 60 * 5}`, t("settings_autorun_5min"));
        dropdown.addOption(`${1000 * 60 * 10}`, t("settings_autorun_10min"));
        dropdown.addOption(`${1000 * 60 * 30}`, t("settings_autorun_30min"));

        dropdown
          .setValue(`${this.plugin.settings.autoRunEveryMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = parseInt(val);
            this.plugin.settings.autoRunEveryMilliseconds = realVal;
            await this.plugin.saveSettings();
            if (
              (realVal === undefined || realVal === null || realVal <= 0) &&
              this.plugin.autoRunIntervalID !== undefined
            ) {
              // clear
              window.clearInterval(this.plugin.autoRunIntervalID);
              this.plugin.autoRunIntervalID = undefined;
            } else if (
              realVal !== undefined &&
              realVal !== null &&
              realVal > 0
            ) {
              const intervalID = window.setInterval(() => {
                console.info("auto run from settings.ts");
                this.plugin.syncRun("auto");
              }, realVal);
              this.plugin.autoRunIntervalID = intervalID;
              this.plugin.registerInterval(intervalID);
            }
          });
      });

    new Setting(basicDiv)
      .setName(t("settings_runoncestartup"))
      .setDesc(t("settings_runoncestartup_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_runoncestartup_notset"));
        dropdown.addOption(
          `${1000 * 1 * 1}`,
          t("settings_runoncestartup_1sec")
        );
        dropdown.addOption(
          `${1000 * 10 * 1}`,
          t("settings_runoncestartup_10sec")
        );
        dropdown.addOption(
          `${1000 * 30 * 1}`,
          t("settings_runoncestartup_30sec")
        );
        dropdown
          .setValue(`${this.plugin.settings.initRunAfterMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = parseInt(val);
            this.plugin.settings.initRunAfterMilliseconds = realVal;
            await this.plugin.saveSettings();
          });
      });

    new Setting(basicDiv)
      .setName(t("settings_saverun"))
      .setDesc(t("settings_saverun_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_saverun_notset"));
        dropdown.addOption(`${1000 * 1}`, t("settings_saverun_1sec"));
        dropdown.addOption(`${1000 * 5}`, t("settings_saverun_5sec"));
        dropdown.addOption(`${1000 * 10}`, t("settings_saverun_10sec"));
        dropdown.addOption(`${1000 * 60}`, t("settings_saverun_1min"));
        let runScheduled = false;
        dropdown
          .setValue(`${this.plugin.settings.syncOnSaveAfterMilliseconds}`)
          .onChange(async (val: string) => {
            const realVal = parseInt(val);
            this.plugin.settings.syncOnSaveAfterMilliseconds = realVal;
            await this.plugin.saveSettings();
            if (
              (realVal === undefined || realVal === null || realVal <= 0) &&
              this.plugin.syncOnSaveIntervalID !== undefined
            ) {
              // clear
              window.clearInterval(this.plugin.syncOnSaveIntervalID);
              this.plugin.syncOnSaveIntervalID = undefined;
            } else if (
              realVal !== undefined &&
              realVal !== null &&
              realVal > 0
            ) {
              const intervalID = window.setInterval(() => {
                const currentFile = this.app.workspace.getActiveFile();

                if (currentFile) {
                  // get the last modified time of the current file
                  // if it has been modified within the last syncOnSaveAfterMilliseconds
                  // then schedule a run for syncOnSaveAfterMilliseconds after it was modified
                  const lastModified = currentFile.stat.mtime;
                  const currentTime = Date.now();
                  // console.debug(
                  //   `Checking if file was modified within last ${
                  //     this.plugin.settings.syncOnSaveAfterMilliseconds / 1000
                  //   } seconds, last modified: ${
                  //     (currentTime - lastModified) / 1000
                  //   } seconds ago`
                  // );
                  if (
                    currentTime - lastModified <
                    this.plugin.settings.syncOnSaveAfterMilliseconds!
                  ) {
                    if (!runScheduled) {
                      const scheduleTimeFromNow =
                        this.plugin.settings.syncOnSaveAfterMilliseconds! -
                        (currentTime - lastModified);
                      console.info(
                        `schedule a run for ${scheduleTimeFromNow} milliseconds later`
                      );
                      runScheduled = true;
                      setTimeout(() => {
                        this.plugin.syncRun("auto_sync_on_save");
                        runScheduled = false;
                      }, scheduleTimeFromNow);
                    }
                  }
                }
              }, realVal);
              this.plugin.syncOnSaveIntervalID = intervalID;
              this.plugin.registerInterval(intervalID);
            }
          });
      });

    new Setting(basicDiv)
      .setName(t("settings_skiplargefiles"))
      .setDesc(t("settings_skiplargefiles_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("-1", t("settings_skiplargefiles_notset"));

        const mbs = [1, 5, 10, 50, 100, 500, 1000];
        for (const mb of mbs) {
          dropdown.addOption(`${mb * 1000 * 1000}`, `${mb} MB`);
        }
        dropdown
          .setValue(`${this.plugin.settings.skipSizeLargerThan}`)
          .onChange(async (val) => {
            this.plugin.settings.skipSizeLargerThan = parseInt(val);
            await this.plugin.saveSettings();
          });
      });

    // custom status bar items is not supported on mobile
    if (!Platform.isMobileApp) {
      new Setting(basicDiv)
        .setName(t("settings_enablestatusbar_info"))
        .setDesc(t("settings_enablestatusbar_info_desc"))
        .addToggle((toggle) => {
          toggle
            .setValue(this.plugin.settings.enableStatusBarInfo ?? false)
            .onChange(async (val) => {
              this.plugin.settings.enableStatusBarInfo = val;
              await this.plugin.saveSettings();
              new Notice(t("settings_enablestatusbar_reloadrequired_notice"));
            });
        });

      new Setting(basicDiv)
        .setName(t("settings_resetstatusbar_time"))
        .setDesc(t("settings_resetstatusbar_time_desc"))
        .addButton((button) => {
          button.setButtonText(t("settings_resetstatusbar_button"));
          button.onClick(async () => {
            // reset last sync time
            await upsertLastSuccessSyncTimeByVault(
              this.plugin.db,
              this.plugin.vaultRandomID,
              -1
            );
            this.plugin.updateLastSuccessSyncMsg(-1);
            new Notice(t("settings_resetstatusbar_notice"));
          });
        });
    }

    new Setting(basicDiv)
      .setName(t("settings_ignorepaths"))
      .setDesc(t("settings_ignorepaths_desc"))
      .setClass("ignorepaths-settings")

      .addTextArea((textArea) => {
        textArea
          .setValue(`${(this.plugin.settings.ignorePaths ?? []).join("\n")}`)
          .onChange(async (value) => {
            this.plugin.settings.ignorePaths = value
              .trim()
              .split("\n")
              .filter((x) => x.trim() !== "");
            await this.plugin.saveSettings();
          });
        textArea.inputEl.rows = 10;
        textArea.inputEl.cols = 30;

        textArea.inputEl.addClass("ignorepaths-textarea");
      });

    //////////////////////////////////////////////////
    // below for advanced settings
    //////////////////////////////////////////////////
    const advDiv = containerEl.createEl("div");
    advDiv.createEl("h2", {
      text: t("settings_adv"),
    });

    new Setting(advDiv)
      .setName(t("settings_concurrency"))
      .setDesc(t("settings_concurrency_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("1", "1");
        dropdown.addOption("2", "2");
        dropdown.addOption("3", "3");
        dropdown.addOption("5", "5 (default)");
        dropdown.addOption("10", "10");
        dropdown.addOption("15", "15");
        dropdown.addOption("20", "20");

        dropdown
          .setValue(`${this.plugin.settings.concurrency}`)
          .onChange(async (val) => {
            const realVal = parseInt(val);
            this.plugin.settings.concurrency = realVal;
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("settings_syncunderscore"))
      .setDesc(t("settings_syncunderscore_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("disable", t("disable"));
        dropdown.addOption("enable", t("enable"));
        dropdown
          .setValue(
            `${this.plugin.settings.syncUnderscoreItems ? "enable" : "disable"}`
          )
          .onChange(async (val) => {
            this.plugin.settings.syncUnderscoreItems = val === "enable";
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("settings_configdir"))
      .setDesc(
        t("settings_configdir_desc", {
          configDir: this.app.vault.configDir,
        })
      )
      .addDropdown((dropdown) => {
        dropdown.addOption("disable", t("disable"));
        dropdown.addOption("enable", t("enable"));

        const bridge = {
          secondConfirm: false,
        };
        dropdown
          .setValue(
            `${this.plugin.settings.syncConfigDir ? "enable" : "disable"}`
          )
          .onChange(async (val) => {
            if (val === "enable" && !bridge.secondConfirm) {
              dropdown.setValue("disable");
              new SyncConfigDirModal(this.app, this.plugin, () => {
                bridge.secondConfirm = true;
                dropdown.setValue("enable");
              }).open();
            } else {
              bridge.secondConfirm = false;
              this.plugin.settings.syncConfigDir = false;
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(advDiv)
      .setName(t("settings_deletetowhere"))
      .setDesc(t("settings_deletetowhere_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("system", t("settings_deletetowhere_system_trash"));
        dropdown.addOption(
          "obsidian",
          t("settings_deletetowhere_obsidian_trash")
        );
        dropdown
          .setValue(this.plugin.settings.deleteToWhere ?? "system")
          .onChange(async (val) => {
            this.plugin.settings.deleteToWhere = val as "system" | "obsidian";
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("settings_conflictaction"))
      .setDesc(t("settings_conflictaction_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption(
          "keep_newer",
          t("settings_conflictaction_keep_newer")
        );
        dropdown.addOption(
          "keep_larger",
          t("settings_conflictaction_keep_larger")
        );
        dropdown
          .setValue(this.plugin.settings.conflictAction ?? "keep_newer")
          .onChange(async (val) => {
            this.plugin.settings.conflictAction = val as ConflictActionType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("settings_cleanemptyfolder"))
      .setDesc(t("settings_cleanemptyfolder_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption("skip", t("settings_cleanemptyfolder_skip"));
        dropdown.addOption(
          "clean_both",
          t("settings_cleanemptyfolder_clean_both")
        );
        dropdown
          .setValue(this.plugin.settings.howToCleanEmptyFolder ?? "skip")
          .onChange(async (val) => {
            this.plugin.settings.howToCleanEmptyFolder =
              val as EmptyFolderCleanType;
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("settings_protectmodifypercentage"))
      .setDesc(t("settings_protectmodifypercentage_desc"))
      .addDropdown((dropdown) => {
        for (const i of Array.from({ length: 11 }, (x, i) => i * 10)) {
          let desc = `${i}`;
          if (i === 0) {
            desc = t("settings_protectmodifypercentage_000_desc");
          } else if (i === 50) {
            desc = t("settings_protectmodifypercentage_050_desc");
          } else if (i === 100) {
            desc = t("settings_protectmodifypercentage_100_desc");
          }
          dropdown.addOption(`${i}`, desc);
        }
        dropdown
          .setValue(`${this.plugin.settings.protectModifyPercentage ?? 50}`)
          .onChange(async (val) => {
            this.plugin.settings.protectModifyPercentage = parseInt(val);
            await this.plugin.saveSettings();
          });
      });

    new Setting(advDiv)
      .setName(t("setting_syncdirection"))
      .setDesc(t("setting_syncdirection_desc"))
      .addDropdown((dropdown) => {
        dropdown.addOption(
          "bidirectional",
          t("setting_syncdirection_bidirectional_desc")
        );
        dropdown.addOption(
          "incremental_push_only",
          t("setting_syncdirection_incremental_push_only_desc")
        );
        dropdown.addOption(
          "incremental_pull_only",
          t("setting_syncdirection_incremental_pull_only_desc")
        );

        dropdown
          .setValue(this.plugin.settings.syncDirection ?? "bidirectional")
          .onChange(async (val) => {
            this.plugin.settings.syncDirection = val as SyncDirectionType;
            await this.plugin.saveSettings();
          });
      });

    if (Platform.isMobile) {
      new Setting(advDiv)
        .setName(t("settings_enablemobilestatusbar"))
        .setDesc(t("settings_enablemobilestatusbar_desc"))
        .addDropdown(async (dropdown) => {
          dropdown
            .addOption("enable", t("enable"))
            .addOption("disable", t("disable"));

          dropdown
            .setValue(
              `${
                this.plugin.settings.enableMobileStatusBar
                  ? "enable"
                  : "disable"
              }`
            )
            .onChange(async (val) => {
              if (val === "enable") {
                this.plugin.settings.enableMobileStatusBar = true;
                changeMobileStatusBar("enable");
              } else {
                this.plugin.settings.enableMobileStatusBar = false;
                changeMobileStatusBar("disable");
              }
              await this.plugin.saveSettings();
            });
        });
    }

    //////////////////////////////////////////////////
    // below for import and export functions
    //////////////////////////////////////////////////

    // import and export
    const importExportDiv = containerEl.createEl("div");
    importExportDiv.createEl("h2", {
      text: t("settings_importexport"),
    });

    new Setting(importExportDiv)
      .setName(t("settings_export"))
      .setDesc(t("settings_export_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_export_desc_button"));
        button.onClick(async () => {
          new ExportSettingsQrCodeModal(this.app, this.plugin).open();
        });
      });

    new Setting(importExportDiv)
      .setName(t("settings_import"))
      .setDesc(t("settings_import_desc"));

    //////////////////////////////////////////////////
    // below for debug
    //////////////////////////////////////////////////

    const debugDiv = containerEl.createEl("div");
    debugDiv.createEl("h2", { text: t("settings_debug") });

    new Setting(debugDiv)
      .setName(t("settings_debuglevel"))
      .setDesc(t("settings_debuglevel_desc"))
      .addDropdown(async (dropdown) => {
        dropdown.addOption("info", "info");
        dropdown.addOption("debug", "debug");
        dropdown
          .setValue(this.plugin.settings.currLogLevel ?? "info")
          .onChange(async (val: string) => {
            this.plugin.settings.currLogLevel = val;
            await this.plugin.saveSettings();
            console.info(`the log level is changed to ${val}`);
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_outputsettingsconsole"))
      .setDesc(t("settings_outputsettingsconsole_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_outputsettingsconsole_button"));
        button.onClick(async () => {
          const c = messyConfigToNormal(await this.plugin.loadData());
          console.info(c);
          new Notice(t("settings_outputsettingsconsole_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_obfuscatesettingfile"))
      .setDesc(t("settings_obfuscatesettingfile_desc"))
      .addDropdown(async (dropdown) => {
        dropdown
          .addOption("enable", t("enable"))
          .addOption("disable", t("disable"));

        dropdown
          .setValue(
            `${
              this.plugin.settings.obfuscateSettingFile ? "enable" : "disable"
            }`
          )
          .onChange(async (val) => {
            if (val === "enable") {
              this.plugin.settings.obfuscateSettingFile = true;
            } else {
              this.plugin.settings.obfuscateSettingFile = false;
            }
            await this.plugin.saveSettings();
          });
      });

    new Setting(debugDiv)
      .setName(t("settings_viewconsolelog"))
      .setDesc(stringToFragment(t("settings_viewconsolelog_desc")));

    new Setting(debugDiv)
      .setName(t("settings_syncplans"))
      .setDesc(t("settings_syncplans_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_syncplans_button_json"));
        button.onClick(async () => {
          await exportVaultSyncPlansToFiles(
            this.plugin.db,
            this.app.vault,
            this.plugin.vaultRandomID
          );
          new Notice(t("settings_syncplans_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_delsyncplans"))
      .setDesc(t("settings_delsyncplans_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_delsyncplans_button"));
        button.onClick(async () => {
          await clearAllSyncPlanRecords(this.plugin.db);
          new Notice(t("settings_delsyncplans_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_delprevsync"))
      .setDesc(t("settings_delprevsync_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_delprevsync_button"));
        button.onClick(async () => {
          await clearAllPrevSyncRecordByVault(
            this.plugin.db,
            this.plugin.vaultRandomID
          );
          new Notice(t("settings_delprevsync_notice"));
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_outputbasepathvaultid"))
      .setDesc(t("settings_outputbasepathvaultid_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_outputbasepathvaultid_button"));
        button.onClick(async () => {
          new Notice(this.plugin.getVaultBasePath());
          new Notice(this.plugin.vaultRandomID);
        });
      });

    new Setting(debugDiv)
      .setName(t("settings_resetcache"))
      .setDesc(t("settings_resetcache_desc"))
      .addButton(async (button) => {
        button.setButtonText(t("settings_resetcache_button"));
        button.onClick(async () => {
          await destroyDBs();
          new Notice(t("settings_resetcache_notice"));
          this.plugin.unload();
        });
      });
  }

  hide() {
    let { containerEl } = this;
    containerEl.empty();
    super.hide();
  }
}
