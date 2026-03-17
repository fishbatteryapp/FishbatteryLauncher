#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod error;
mod events;
mod logs;
mod state;

use tauri::Manager;

fn main() {
  tauri::Builder::default()
    .plugin(tauri_plugin_updater::Builder::new().build())
    .manage(state::AppState::default())
    .setup(|app| {
      let app_handle = app.handle().clone();
      if let Err(err) = logs::init(&app.handle()) {
        eprintln!("failed to initialize launcher logs: {err}");
      }
      let splash = tauri::WebviewWindowBuilder::new(
        app,
        "startup-splash",
        tauri::WebviewUrl::App("splash.html".into()),
      )
      .title("Starting Fishbattery Launcher")
      .inner_size(360.0, 420.0)
      .resizable(false)
      .maximizable(false)
      .minimizable(false)
      .closable(false)
      .decorations(false)
      .shadow(true)
      .transparent(false)
      .center()
      .build();
      if let Err(err) = splash {
        eprintln!("failed to create startup splash window: {err}");
      }
      tauri::async_runtime::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(4000)).await;
        if let Some(window) = app_handle.get_webview_window("main") {
          let _ = window.show();
          let _ = window.set_focus();
        }
        if let Some(splash) = app_handle.get_webview_window("startup-splash") {
          let _ = splash.close();
        }
      });
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      commands::health::ping,
      commands::window_shell::window_minimize,
      commands::window_shell::window_toggle_maximize,
      commands::window_shell::window_is_maximized,
      commands::window_shell::window_is_fullscreen,
      commands::window_shell::window_drag_restore,
      commands::window_shell::window_drag_move,
      commands::window_shell::window_drag_end,
      commands::window_shell::window_toggle_fullscreen,
      commands::window_shell::window_close,
      commands::window_shell::window_show,
      commands::window_shell::window_set_title_bar_theme,
      commands::window_shell::external_open,
      commands::window_shell::versions_list,
      commands::accounts_capes::accounts_list,
      commands::accounts_capes::accounts_get_avatar,
      commands::accounts_capes::accounts_add,
      commands::accounts_capes::accounts_set_active,
      commands::accounts_capes::accounts_remove,
      commands::accounts_capes::capes_list_local,
      commands::accounts_capes::capes_get_local_selection,
      commands::accounts_capes::capes_set_local_selection,
      commands::accounts_capes::launcher_accounts_sync,
      commands::accounts_capes::launcher_session_sync,
      commands::accounts_capes::capes_list_official,
      commands::accounts_capes::capes_set_official_active,
      commands::accounts_capes::skins_set_official_active,
      commands::accounts_capes::skins_upload_official,
      commands::playit::playit_get_state,
      commands::playit::playit_link_begin,
      commands::playit::playit_link_complete,
      commands::playit::playit_link_secret,
      commands::playit::playit_unlink,
      commands::playit::playit_list_tunnels,
      commands::playit::playit_create_tunnel,
      commands::playit::playit_update_tunnel,
      commands::playit::playit_delete_tunnel,
      commands::runtime_ops::instances_list,
      commands::runtime_ops::instances_sync_export,
      commands::runtime_ops::instances_sync_import,
      commands::runtime_ops::loader_pick_version,
      commands::runtime_ops::loader_install,
      commands::runtime_ops::mods_list,
      commands::runtime_ops::mods_validate,
      commands::runtime_ops::mods_set_enabled,
      commands::runtime_ops::mods_refresh,
      commands::runtime_ops::mods_plan_refresh,
      commands::runtime_ops::mods_refresh_selected,
      commands::runtime_ops::mods_sync_bridge,
      commands::runtime_ops::mods_fix_duplicates,
      commands::runtime_ops::packs_list,
      commands::runtime_ops::packs_refresh,
      commands::runtime_ops::packs_set_enabled,
      commands::runtime_ops::instances_create,
      commands::runtime_ops::instances_set_active,
      commands::runtime_ops::instances_update,
      commands::runtime_ops::instances_remove,
      commands::runtime_ops::instances_duplicate,
      commands::runtime_ops::instances_open_folder,
      commands::runtime_ops::instances_export,
      commands::runtime_ops::instances_import,
      commands::runtime_ops::external_profiles_list,
      commands::runtime_ops::external_profile_import,
      commands::runtime_ops::instances_import_into,
      commands::runtime_ops::instances_pick_icon,
      commands::runtime_ops::instances_preview_icon_data_url,
      commands::runtime_ops::instances_set_icon_from_file,
      commands::runtime_ops::instances_set_icon_from_url,
      commands::runtime_ops::instances_set_icon_fallback,
      commands::runtime_ops::instances_get_icon,
      commands::runtime_ops::instances_clear_icon,
      commands::runtime_ops::content_pick_files,
      commands::runtime_ops::content_add,
      commands::runtime_ops::content_list,
      commands::runtime_ops::local_mods_metadata,
      commands::runtime_ops::local_packs_metadata,
      commands::runtime_ops::content_remove,
      commands::runtime_ops::content_toggle_enabled,
      commands::runtime_ops::lockfile_generate,
      commands::runtime_ops::lockfile_drift,
      commands::runtime_ops::servers_list,
      commands::runtime_ops::servers_upsert,
      commands::runtime_ops::servers_remove,
      commands::runtime_ops::servers_set_preferred,
      commands::runtime_ops::servers_export_profile,
      commands::runtime_ops::servers_import_profile,
      commands::runtime_ops::modrinth_packs_install,
      commands::runtime_ops::modrinth_packs_apply_to_instance,
      commands::runtime_ops::modrinth_mods_search,
      commands::runtime_ops::modrinth_mods_install,
      commands::runtime_ops::modrinth_content_search,
      commands::runtime_ops::modrinth_content_install,
      commands::runtime_ops::provider_packs_install,
      commands::runtime_ops::provider_packs_search_curseforge,
      commands::runtime_ops::pack_archive_import,
      commands::runtime_ops::pack_archive_apply_to_instance,
      commands::runtime_ops::vanilla_install,
      commands::runtime_ops::fabric_pick_loader,
      commands::runtime_ops::fabric_install,
      commands::system_health::preflight_run,
      commands::system_health::preflight_get_last,
      commands::maintenance::optimizer_preview,
      commands::maintenance::optimizer_apply,
      commands::maintenance::optimizer_restore,
      commands::maintenance::benchmark_run,
      commands::maintenance::benchmark_list,
      commands::maintenance::updater_get_state,
      commands::maintenance::updater_get_channel,
      commands::maintenance::updater_set_channel,
      commands::maintenance::updater_check,
      commands::maintenance::updater_download,
      commands::maintenance::updater_install,
      commands::maintenance::diagnostics_export,
      commands::lifecycle::launch,
      commands::lifecycle::launch_is_running,
      commands::lifecycle::launch_stop,
      commands::lifecycle::launch_diagnose,
      commands::lifecycle::launch_apply_fix,
      commands::lifecycle::rollback_create_snapshot,
      commands::lifecycle::rollback_get_latest,
      commands::lifecycle::rollback_restore_latest,
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
