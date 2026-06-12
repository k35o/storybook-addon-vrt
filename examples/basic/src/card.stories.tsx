import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card } from './card';

const meta = {
  component: Card,
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    title: 'Static card',
    children: 'The content of this card never changes.',
  },
};

export const MaskedTimestamp: Story = {
  args: { title: 'Report', children: null },
  render: (args) => (
    <Card title={args.title}>
      Generated at <span data-vrt-dynamic>{new Date().toISOString()}</span>
    </Card>
  ),
  parameters: { vrt: { mask: '[data-vrt-dynamic]' } },
};
