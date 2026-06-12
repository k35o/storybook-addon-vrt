import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';
import { Button } from './button';

const meta = {
  component: Button,
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: { label: 'Click me' },
};

export const Clicked: Story = {
  args: { label: 'Click me' },
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole('button'));
    await expect(canvas.getByRole('button')).toHaveTextContent('Click me (1)');
  },
};

export const SkippedInVrt: Story = {
  args: { label: 'Not captured' },
  parameters: { vrt: { skip: true } },
};
