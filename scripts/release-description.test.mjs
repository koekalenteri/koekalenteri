import { notesFileFor, releaseDescription } from './release-description.mjs'

describe('release-description', () => {
  it.each([
    ['v2.1.0', 'docs/en/whats-new/2.1.0.md'],
    ['v2.1.0-beta.1', 'docs/en/whats-new/2.1.0.md'],
    ['2.0.1', 'docs/en/whats-new/2.0.1.md'],
  ])('%s describes itself with %s', (tag, file) => {
    expect(notesFileFor(tag)).toBe(file)
  })

  it('drops the frontmatter and names the controls in English', () => {
    const source = '---\ndate: 2026-11-02\nsourceHash: ac676b\n---\n\n## New\n\n- Open **{t:support}** for help.\n'

    expect(releaseDescription(source, 'notes.md')).toBe('## New\n\n- Open **Support** for help.\n')
  })

  it('refuses a key the translations do not have', () => {
    const source = '---\ndate: 2026-11-02\n---\n\n- **{t:no.such.key}**\n'

    expect(() => releaseDescription(source, 'notes.md')).toThrow('no translation "no.such.key"')
  })

  it('refuses notes without frontmatter', () => {
    expect(() => releaseDescription('## New\n', 'notes.md')).toThrow('no frontmatter')
  })
})
