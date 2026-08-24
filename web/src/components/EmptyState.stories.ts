import type { Meta, StoryObj } from '@storybook/vue3-vite'
import EmptyState from '../components/EmptyState.vue'

const meta = {
  title: 'SingTags/EmptyState',
  component: EmptyState,
  tags: ['autodocs'],
  argTypes: {
    tone: { control: 'select', options: ['muted', 'danger'] },
  },
  args: {
    title: 'Nothing here',
    message: 'Try another search or clear filters.',
    tone: 'muted',
  },
} satisfies Meta<typeof EmptyState>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}

export const Danger: Story = {
  args: {
    title: 'Could not load tag',
    message: 'Missing tag (404)',
    tone: 'danger',
  },
}

export const WithAction: Story = {
  render: (args) => ({
    components: { EmptyState },
    setup: () => ({ args }),
    template: `<EmptyState v-bind="args"><button type="button">Go back</button></EmptyState>`,
  }),
}
