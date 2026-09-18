import type { NodeResult, Result } from 'axe-core'

/**
 * Whether a finding sits on text that belongs to an inactive user interface component.
 *
 * MUI marks the whole group with `Mui-disabled` — the control, its label and its helper text — so
 * that class is what tells a disabled field's greyed text apart from text a reader is meant to read.
 * Needs axe's `elementRef` option, which is what puts the node itself in the result.
 */
const isInactive = (node: Pick<NodeResult, 'element'>): boolean => Boolean(node.element?.closest('.Mui-disabled'))

/**
 * The violations worth reporting, with the exemption WCAG 1.4.3 already grants applied.
 *
 * The rule does not ask a contrast ratio of text that is part of an inactive component, and looking
 * muted is how a disabled control says what it is; raising that colour would trade a real signal for
 * a rule that does not apply to it. axe reports it anyway, because the `disabled` attribute sits on
 * the input while the greyed text is a label and a helper beside it, neither disabled in its own
 * right (KOE-1375).
 *
 * Nothing else is dropped. A rule that fires on a disabled control for any other reason is a real
 * finding, and so is muted text that no disabled control owns — the filter is this narrow on
 * purpose, because what it hides, nobody sees again.
 */
export const readableTextOnly = (violations: Result[]): Result[] =>
  violations
    .map((violation) =>
      violation.id === 'color-contrast'
        ? { ...violation, nodes: violation.nodes.filter((node) => !isInactive(node)) }
        : violation
    )
    .filter((violation) => violation.nodes.length > 0)
