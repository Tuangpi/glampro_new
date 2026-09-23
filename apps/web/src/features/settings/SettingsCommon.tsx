/**
 * The settings screens import their form primitives from here. The primitives
 * themselves live in `features/shared/FormControls` so other modules such as
 * the catalog screens can reuse the exact same controls.
 */
export {
  Field,
  PermissionNotice,
  SectionCard,
  StatusMessage,
  inputClass,
  primaryButtonClass,
  subtleButtonClass,
} from '../shared/FormControls';
