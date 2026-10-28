import type { Meta, StoryObj } from '@storybook/react-vite';
import { CodeBlock } from './code-block';

const meta = {
  component: CodeBlock,
} satisfies Meta<typeof CodeBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

const install = 'pnpm add -D storybook-addon-vrt';

// The order matters: the stories of a file run on one browser page, and the
// e2e harness checks that capturing LongListing (taller than the viewport)
// leaves the generic `monospace` of the next story untouched.
export const Install: Story = {
  args: { code: install },
};

export const LongListing: Story = {
  args: { code: Array.from({ length: 80 }, (_, index) => `line ${index + 1}`).join('\n') },
};

export const InstallAfterLongListing: Story = {
  args: { code: install },
};
