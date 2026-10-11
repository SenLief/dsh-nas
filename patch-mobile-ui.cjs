const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');
const cli = path.resolve(process.argv[2] || '/opt/dsh/lib/node_modules/@deepseek-ai/dsh/package.json');
const load = createRequire(cli);
function client(name) {
  const metadataFile = load.resolve(`${name}/package.json`);
  const metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
  if (metadata.version !== '0.2.0-rc.2') throw new Error(`Mobile patch requires ${name}@0.2.0-rc.2`);
  const file = path.join(path.dirname(metadataFile), 'lib/client.js');
  return { file, source: fs.readFileSync(file, 'utf8') };
}
const layout = client('@deepseek-ai/dsh-client-ui-layout');
const marker = '// NAS_MOBILE_UI_V2';
if (layout.source.includes(marker)) process.exit(0);
const sidebar = client('@deepseek-ai/dsh-client-ui-sidebar');
function replaceIn(bundle, needle, value) {
  if (bundle.source.split(needle).length !== 2) throw new Error(`Unexpected client bundle ${bundle.file}: ${needle}`);
  bundle.source = bundle.source.replace(needle, value);
}
const replace = (needle, value) => replaceIn(layout, needle, value);
// Reuse the upstream new-session action and accessible name for the phone FAB.
replaceIn(sidebar,
  'className: HeaderLeadingControls_module_css_default.iconButton,\n\t\t\t\t\t\t"aria-label": t("session.new.label"),',
  'className: HeaderLeadingControls_module_css_default.iconButton,\n\t\t\t\t\t\t"data-nas-new-session": true,\n\t\t\t\t\t\t"aria-label": t("session.new.label"),');
// Hooks live inside the original React factory. Navigation and sidebar contents
// keep using the upstream services; no polling or synthetic DOM button clicks.
const drawerHook = `function useNasDrawer(ref, opened, close) {
  react.useEffect(() => {
    if (!opened || ref.current === null) return;
    const panel = ref.current;
    const previous = document.activeElement;
    const frame = panel.parentElement;
    const background = [...frame.children].filter(el => el !== panel && !el.hasAttribute('data-nas-mobile-backdrop'));
    const inert = background.map(el => [el, el.inert]);
    for (const [el] of inert) el.inert = true;
    const focusables = () => [...panel.querySelectorAll('button:not([disabled]), input:not([disabled]), a[href], [tabindex="0"]')].filter(el => el.getClientRects().length > 0);
    focusables()[0]?.focus({preventScroll: true});
    const keydown = event => {
      if (event.defaultPrevented || [...document.querySelectorAll('[aria-modal="true"]')].some(el => el !== panel && !panel.contains(el))) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const list = focusables();
        const first = list[0], last = list.at(-1);
        if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', keydown);
    return () => {
      document.removeEventListener('keydown', keydown);
      for (const [el, wasInert] of inert) el.inert = wasInert;
      if (!document.querySelector('[aria-modal="true"]')) {
        const target = previous?.isConnected && previous.getClientRects().length > 0 ? previous : frame.querySelector('[data-nas-mobile-leading] button');
        target?.focus({preventScroll: true});
      }
    };
  }, [ref, opened, close]);
}
`;
replace('function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t }) {',
  drawerHook + 'function AppFrame({ useStore, useSessions, usePanelInfo, actions, renderSlot, t }) {');
replace('const viewport = layoutInfo.viewportWidth;', 'const viewport = layoutInfo.viewportWidth;\n\t\t\tconst mobile = viewport <= 768;\n\t\t\tconst drawerRef = react.useRef(null);');
replace('const sidebarPreference = sidebarCollapsed ? 0 : layoutInfo.sidebar === 0 ? 280 : layoutInfo.sidebar;',
  'useNasDrawer(drawerRef, mobile && !sidebarCollapsed, actions.closeMobileSidebar);\n\t\t\tconst sidebarPreference = sidebarCollapsed ? 0 : layoutInfo.sidebar === 0 ? 280 : layoutInfo.sidebar;');
replace('const collapsedWidth = darwin || document.documentElement.hasAttribute("data-windows-titlebar") ? 0 : 56;',
  'const collapsedWidth = mobile || darwin || document.documentElement.hasAttribute("data-windows-titlebar") ? 0 : 56;');
replace('width: cols.sidebar\n\t\t\t}), [', 'width: mobile ? Math.min(320, viewport - 48) : cols.sidebar\n\t\t\t}), [\n\t\t\t\tmobile, viewport,');
replace('const leadingMounted = darwin && sidebarCollapsed;', 'const leadingMounted = (mobile || darwin) && sidebarCollapsed;');
replace('"data-sidebar-collapsed": sidebarCollapsed || void 0,', '"data-nas-mobile-frame": mobile || void 0,\n\t\t\t\t"data-sidebar-collapsed": sidebarCollapsed || void 0,');
replace('className: AppFrame_module_css_default.centerCol,', 'className: AppFrame_module_css_default.centerCol,\n\t\t\t\t"data-nas-main": true,');
replace('className: AppFrame_module_css_default.sidebarCol,\n\t\t\t\t\t\tchildren: sidebar',
  `className: AppFrame_module_css_default.sidebarCol,
                        ref: drawerRef,
                        hidden: mobile && sidebarCollapsed,
                        "data-nas-mobile-drawer": mobile || void 0,
                        role: mobile && !sidebarCollapsed ? "dialog" : void 0,
                        "aria-modal": mobile && !sidebarCollapsed ? "true" : void 0,
                        "aria-label": mobile ? (document.documentElement.lang.startsWith("zh") ? "导航菜单" : "Navigation menu") : void 0,
                        onClick: event => {
                          if (mobile && event.target.closest('button[aria-haspopup="dialog"]')) actions.closeMobileSidebar();
                        },
                        children: sidebar`);
replace('leadingMounted && (0, react_jsx_runtime.jsx)("div", {',
  `mobile && !sidebarCollapsed && (0, react_jsx_runtime.jsx)("button", {
                        type: "button", "data-nas-mobile-backdrop": true,
                        "aria-label": document.documentElement.lang.startsWith("zh") ? "关闭导航菜单" : "Close navigation menu",
                        tabIndex: -1, onClick: actions.closeMobileSidebar
                    }),
                    leadingMounted && (0, react_jsx_runtime.jsx)("div", {`);
replace('"data-shell-leading": true,', '"data-shell-leading": true,\n\t\t\t\t\t\t"data-nas-mobile-leading": mobile || void 0,');
replace('!sidebarCollapsed && (0, react_jsx_runtime.jsx)(DragHandle, {', '!mobile && !sidebarCollapsed && (0, react_jsx_runtime.jsx)(DragHandle, {');
replace('selectPanel: (d, panelId) => {\n\t\t\t\t\t\td.panelInfo.activePanelId = panelId;',
  'selectPanel: (d, panelId) => {\n\t\t\t\t\t\tif (d.layoutInfo.viewportWidth <= 768) d.layoutInfo.narrowExpanded = false;\n\t\t\t\t\t\td.panelInfo.activePanelId = panelId;');
replace('toggleSidebar: (d) => {', 'closeMobileSidebar: (d) => {\n\t\t\t\t\t\tif (d.layoutInfo.viewportWidth <= 768) d.layoutInfo.narrowExpanded = false;\n\t\t\t\t\t},\n\t\t\t\t\ttoggleSidebar: (d) => {');

// Resolve bundled CSS-module names rather than relying on hash prefixes.
const maps = {
  layout: [layout.source, 'AppFrame'],
  settings: [client('@deepseek-ai/dsh-client-ui-settings-general').source, 'SettingsRoot'],
  permission: [client('@deepseek-ai/dsh-client-ui-permission-presets').source, 'PermissionRow'],
  locale: [client('@deepseek-ai/dsh-client-locale').source, 'LanguageRow'],
  font: [client('@deepseek-ai/dsh-client-ui-theme').source, 'FontSizeRow'],
  theme: [client('@deepseek-ai/dsh-client-ui-theme').source, 'AppearanceRow'],
  models: [client('@deepseek-ai/dsh-client-ui-settings-models').source, 'ModelsSection'],
};
let css = fs.readFileSync(path.join(__dirname, 'mobile-ui.css'), 'utf8');
css = css.replace(/\{\{(\w+)\.(\w+)\}\}/g, (_, namespace, key) => {
  const [source, name] = maps[namespace] || [];
  const object = source?.match(new RegExp(`var ${name}_module_css_default = (\\{[\\s\\S]*?\\});`))?.[1];
  const classname = object?.match(new RegExp(`"${key}": "([^"]+)"`))?.[1];
  if (!classname) throw new Error(`Missing CSS mapping ${namespace}.${key}`);
  return '.' + classname;
});
const installStyle = `\nif (typeof document !== "undefined" && !document.querySelector('style[data-nas-mobile-ui]')) {
  const style = document.createElement('style');
  style.setAttribute('data-nas-mobile-ui', '');
  style.textContent = ${JSON.stringify(css)};
  document.head.appendChild(style);
}\n`;
fs.writeFileSync(layout.file, marker + '\n' + layout.source + installStyle);
fs.writeFileSync(sidebar.file, marker + '\n' + sidebar.source);
console.log('Installed phone settings, aligned drawer controls and new-session FAB');
