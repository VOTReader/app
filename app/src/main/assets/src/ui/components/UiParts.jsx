/* ═══════════════════════════════════════════════════════════════════════
   UiParts — the UI pass's shared parts (W1, 2026-11-11). Cluster D (bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   The patterns every screen family builds with (R/U-ui-general-pass.md §3 and
   rules 11-16; the look is R/mock/v2/base.css). Their CSS is the "SHARED
   SURFACES" block in app.css, which the three roots' .root-* classes share, so
   a row built here and a root's row are one rule. Usage for each, four lines:
   R/build/COMPONENTS.md. The bars live in RootNav.jsx, the sheets in
   SelectField.jsx, the icons in UiIcon.jsx.

   The shapes enforce the rules where a prop can: a row takes ONE mark and ONE
   menu (rule 12), an empty state ONE action (rule 15), a tool always says its
   value (rule 14). Strings are the caller's: these parts add no words of
   their own except "Cancel"-style defaults the caller can rename.
   ═══════════════════════════════════════════════════════════════════════ */

import { UiIcon } from './UiIcon.jsx';

const cx = (...parts) => parts.filter(Boolean).join(' ');

/** The 12 px gold section label, with an optional aside: a muted count, or a gold link when `onAside` is given.
 * @param {{ children: any, aside?: any, onAside?: () => void, id?: string }} props */
export function SectionLabel({ children, aside, onAside, id }) {
  if (aside == null) return <h2 className="ui-label" id={id}>{children}</h2>;
  return (
    <div className="ui-label-row">
      <h2 className="ui-label" id={id}>{children}</h2>
      {onAside ? <button type="button" className="ui-link" onClick={onAside}>{aside}</button> : <span className="ui-label-aside">{aside}</span>}
    </div>
  );
}

/** One surface card holding rows, with its section label above. `inset`: a group inside a card or sheet.
 * @param {{ label?: any, aside?: any, onAside?: () => void, inset?: boolean, children: any, className?: string, ariaLabel?: string }} props */
export function ListGroup({ label, aside, onAside, inset = false, children, className = '', ariaLabel }) {
  const labelId = React.useId();
  return (
    <>
      {label ? <SectionLabel aside={aside} onAside={onAside} id={labelId}>{label}</SectionLabel> : null}
      <div className={cx('ui-group', inset && 'is-inset', className)} role="group"
        aria-labelledby={label ? labelId : undefined} aria-label={label ? undefined : ariaLabel}>{children}</div>
    </>
  );
}

/**
 * A list row (rule 12): leading thing, title, one meta line, at most one state mark, one menu.
 *   icon     a UiIcon name drawn in the 38 px chip; or `lead` (any node: a cover, a play button) in its place
 *   value    a short value at the right ("2", "NKJV"); `valueNone` greys it ("None yet")
 *   mark     ONE state: { label, icon? } ("On this phone"), or { tick: true, label } (a round tick, named by label)
 *   menu     ONE menu: { label, onClick }; with a menu the row's own tap is a separate button beside it
 *   onClick  the row opens something: it is a button, with a chevron unless `chevron={false}` or it has a menu
 *   one      a one-line row (54 px); `noLead` drops the leading slot (the hairline then starts at the padding)
 *   switchOn a switch row (true / false): the row is one button, role="switch", the switch drawn where the chevron goes
 *   star     the row's one button besides its menu (rule 12): { on, label, onClick }, a Save star (listen.html au-coll)
 *   remove   a visible × in the menu's place (Recently played, au-root): { label, onClick }
 * @param {{ icon?: string, lead?: any, title: any, meta?: any, value?: any, valueNone?: boolean,
 *   mark?: { label: string, icon?: string, tick?: boolean } | null, menu?: { label: string, onClick: () => void } | null,
 *   star?: { on: boolean, label: string, onClick: () => void } | null, remove?: { label: string, onClick: () => void } | null, switchOn?: boolean,
 *   onClick?: () => void, chevron?: boolean, one?: boolean, noLead?: boolean, ariaLabel?: string, className?: string,
 *   current?: boolean }} props
 */
export function ListRow({ icon, lead, title, meta, value, valueNone = false, mark = null, menu = null, star = null, remove = null, switchOn, onClick, chevron,
  one = false, noLead = false, ariaLabel, className = '', current = false }) {
  const leading = noLead ? null : (lead || (icon ? <span className="ui-row-lead" aria-hidden="true"><UiIcon name={icon} /></span> : null));
  const showChev = chevron === undefined ? !!onClick && !menu && !remove : chevron;
  const body = (
    <>
      {leading}
      <span className="ui-row-text">
        <span className="ui-row-title">{title}</span>
        {meta ? <span className="ui-row-meta">{meta}</span> : null}
      </span>
      {value != null && value !== '' ? <span className={cx('ui-row-value', valueNone && 'is-none')}>{value}</span> : null}
      {mark ? (
        mark.tick
          ? <span className="ui-row-mark is-tick" role="img" aria-label={mark.label}><UiIcon name="check" size="sm" /></span>
          : <span className="ui-row-mark">{mark.icon ? <UiIcon name={mark.icon} size="sm" /> : null}{mark.label}</span>
      ) : null}
      {showChev ? <UiIcon name="chev" className="ui-row-chev" /> : null}
    </>
  );
  const rowCls = cx('ui-row', one && 'is-one', (noLead || !leading) && 'no-lead', className);
  const aria = current ? 'true' : undefined;
  if (menu || star || remove) {
    return (
      <div className={rowCls}>
        {onClick
          ? <button type="button" className="ui-row-main" onClick={onClick} aria-label={ariaLabel} aria-current={aria}>{body}</button>
          : <span className="ui-row-main" aria-current={aria}>{body}</span>}
        {star ? (
          <button type="button" className={cx('ui-row-star', star.on && 'is-on')} onClick={star.onClick} aria-label={star.label}
            title={star.label} aria-pressed={!!star.on}><UiIcon name="star" filled={!!star.on} /></button>
        ) : null}
        {menu ? (
          <button type="button" className="ui-row-menu" onClick={menu.onClick} aria-label={menu.label} title={menu.label} aria-haspopup="dialog">
            <UiIcon name="more" />
          </button>
        ) : null}
        {remove ? (
          <button type="button" className="ui-row-menu" onClick={remove.onClick} aria-label={remove.label} title={remove.label}>
            <UiIcon name="x" />
          </button>
        ) : null}
      </div>
    );
  }
  if (onClick && switchOn !== undefined) {
    return (
      <button type="button" role="switch" aria-checked={!!switchOn} className={cx(rowCls, 'ui-row-press', 'is-switch')} onClick={onClick} aria-label={ariaLabel}>
        {leading}
        <span className="ui-row-text"><span className="ui-row-title">{title}</span>{meta ? <span className="ui-row-meta">{meta}</span> : null}</span>
        <span className={cx('ui-switch', switchOn && 'is-on')} aria-hidden="true" />
      </button>
    );
  }
  if (onClick) {
    return <button type="button" className={cx(rowCls, 'ui-row-press')} onClick={onClick} aria-label={ariaLabel} aria-current={aria}>{body}</button>;
  }
  return <div className={rowCls} aria-current={aria}>{body}</div>;
}

/** A row's round play button, for `lead` (it is the row's one button besides its menu).
 * @param {{ label: string, onClick: () => void, playing?: boolean }} props */
export function RowPlay({ label, onClick, playing = false }) {
  return (
    <button type="button" className="ui-row-lead is-play" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-label={label} aria-pressed={playing}>
      <UiIcon name={playing ? 'pause' : 'play'} filled />
    </button>
  );
}

/**
 * The three buttons (rule 9). kind: 'primary' (gold fill, one per screen part), 'secondary' (surface), 'text' (muted,
 * no box). `small` is 38 px; `danger` only for destroying something; words, never a cross and a tick.
 * @param {{ kind?: 'primary' | 'secondary' | 'text', small?: boolean, danger?: boolean, wide?: boolean, icon?: string,
 *   children: any, onClick?: () => void, disabled?: boolean, type?: 'button' | 'submit', ariaLabel?: string, className?: string }} props
 */
export function UiButton({ kind = 'secondary', small = false, danger = false, wide = false, icon, children, onClick, disabled = false,
  type = 'button', ariaLabel, className = '' }) {
  return (
    <button type={type} disabled={disabled} onClick={onClick} aria-label={ariaLabel}
      className={cx('ui-btn', kind === 'primary' && 'is-primary', kind === 'text' && 'is-text', small && 'is-small', danger && 'is-danger', wide && 'is-wide', className)}>
      {icon ? <UiIcon name={icon} size={small ? 'sm' : 'md'} /> : null}
      {children}
    </button>
  );
}

/** A chip: 38 px pill; `on` is the selected (soft gold) state, announced as pressed.
 * @param {{ on?: boolean, icon?: string, children: any, onClick: () => void }} props */
export function Chip({ on = false, icon, children, onClick }) {
  return (
    <button type="button" className="ui-chip" aria-pressed={on} onClick={onClick}>
      {icon ? <UiIcon name={icon} size="sm" /> : null}{children}
    </button>
  );
}

/** The segmented control: one radio group, 2-4 items, sentence case. Arrows move and pick.
 * @param {{ label: string, options: Array<{ id: string, label: any }>, value: string, onChange: (id: string) => void, className?: string }} props */
export function Segmented({ label, options, value, onChange, className = '' }) {
  /** @param {any} e */
  const onKey = (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[/** @type {'ArrowRight'} */ (e.key)];
    if (!step) return;
    e.preventDefault();
    const at = Math.max(0, options.findIndex((o) => o.id === value));
    const next = options[(at + step + options.length) % options.length];
    onChange(next.id);
    const btn = e.currentTarget.querySelector('[data-seg="' + next.id + '"]');
    if (btn) btn.focus();
  };
  return (
    <div className={cx('ui-seg', className)} role="radiogroup" aria-label={label} onKeyDown={onKey}>
      {options.map((o) => (
        <button key={o.id} type="button" role="radio" data-seg={o.id} className="ui-seg-item" aria-checked={o.id === value}
          tabIndex={o.id === value ? 0 : -1} onClick={() => onChange(o.id)}>{o.label}</button>
      ))}
    </div>
  );
}

/**
 * A tool that says what it is set to (rule 14): "Speed 1×", "Sleep Off", "Up next 8 left", "Newest first".
 * variant 'tile' (icon over name over value; in a .ui-tools row of up to four), 'chip' (one pill), 'link' (the value
 * alone in gold with a down chevron, for a sort above a list). It is always named "name: value" for a screen reader.
 * @param {{ icon?: string, name: string, value: any, onClick: () => void, on?: boolean, variant?: 'tile' | 'chip' | 'link' }} props
 */
export function ValueTool({ icon, name, value, onClick, on, variant = 'tile' }) {
  const cls = cx('ui-tool', variant === 'chip' && 'is-chip', variant === 'link' && 'is-link', on && 'is-on');
  return (
    <button type="button" className={cls} onClick={onClick} aria-label={name + ': ' + value} aria-haspopup="dialog">
      {variant === 'link' ? <UiIcon name="down" /> : (icon ? <UiIcon name={icon} /> : null)}
      <span className="ui-tool-name">{name}</span>
      <span className="ui-tool-value">{value}</span>
    </button>
  );
}

/** A row of up to four value tools. @param {{ children: any, label?: string }} props */
export function ToolRow({ children, label }) {
  return <div className="ui-tools" role="group" aria-label={label}>{children}</div>;
}

/**
 * The empty state (rule 15): a title, ONE sentence on how it fills, ONE button that goes there.
 * @param {{ icon?: string, title: any, text: any, action?: { label: string, onClick: () => void, icon?: string } | null }} props
 */
export function EmptyState({ icon = 'info', title, text, action = null }) {
  return (
    <div className="ui-empty" role="status">
      <span className="ui-empty-icon" aria-hidden="true"><UiIcon name={icon} /></span>
      <h3 className="ui-empty-title">{title}</h3>
      <p className="ui-empty-text">{text}</p>
      {action ? <UiButton kind="primary" icon={action.icon} onClick={action.onClick}>{action.label}</UiButton> : null}
    </div>
  );
}

/**
 * The one notice style (mock/v2 settings.html, screen sy-notices): a surface card with an icon chip, a title and one or
 * two lines, its actions under them, and a dismiss cross only when it can be put away. tone 'danger' (a save failed:
 * a red edge, announced at once), 'warn' (running low: amber edge), 'info' (plain). `inline` puts one action at the right
 * of a one-line notice ("Retry").
 * @param {{ tone?: 'info' | 'warn' | 'danger', icon?: string, title: any, text?: any,
 *   actions?: Array<{ label: string, onClick: () => void, kind?: 'primary' | 'secondary' | 'text' }>,
 *   onDismiss?: () => void, dismissLabel?: string, inline?: boolean, className?: string }} props
 */
export function Notice({ tone = 'info', icon, title, text, actions = [], onDismiss, dismissLabel = 'Dismiss', inline = false, className = '' }) {
  const glyph = icon || (tone === 'info' ? 'info' : 'data');
  const acts = (actions || []).filter(Boolean);
  const buttons = acts.map((a, i) => (
    <UiButton key={i} small kind={a.kind || (tone === 'danger' && i === 0 ? 'primary' : 'secondary')} onClick={a.onClick}>{a.label}</UiButton>
  ));
  return (
    <div className={cx('ui-notice', 'is-' + tone, inline && 'is-inline', className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="ui-row-lead" aria-hidden="true"><UiIcon name={glyph} /></span>
      <div className="ui-notice-text">
        <div className="ui-notice-title">{title}</div>
        {text ? <div className="ui-notice-body">{text}</div> : null}
        {!inline && buttons.length ? <div className="ui-notice-actions">{buttons}</div> : null}
      </div>
      {inline && buttons.length ? buttons : null}
      {onDismiss ? (
        <button type="button" className="ui-notice-x" onClick={onDismiss} aria-label={dismissLabel} title={dismissLabel}>
          <UiIcon name="x" size="sm" />
        </button>
      ) : null}
    </div>
  );
}
