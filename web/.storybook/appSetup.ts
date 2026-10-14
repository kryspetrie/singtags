/**
 * Shared Vue app plugins for Storybook — mirrors main.ts enough for visual mounts.
 */
import { setup } from '@storybook/vue3-vite'
import { createPinia } from 'pinia'
import { createMemoryHistory, createRouter } from 'vue-router'
import { library } from '@fortawesome/fontawesome-svg-core'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'
import {
  faArrowPointer,
  faBackwardFast,
  faBackwardStep,
  faChevronDown,
  faChevronLeft,
  faChevronRight,
  faChevronUp,
  faEllipsisVertical,
  faEye,
  faForwardFast,
  faForwardStep,
  faHand,
  faHeart as faHeartSolid,
  faLayerGroup,
  faPause,
  faPen,
  faPlay,
  faRotateLeft,
  faStop,
} from '@fortawesome/free-solid-svg-icons'
import { faHeart as faHeartRegular } from '@fortawesome/free-regular-svg-icons'

library.add(
  faHeartSolid,
  faHeartRegular,
  faPen,
  faHand,
  faArrowPointer,
  faPlay,
  faPause,
  faStop,
  faEllipsisVertical,
  faBackwardStep,
  faForwardStep,
  faBackwardFast,
  faForwardFast,
  faRotateLeft,
  faChevronLeft,
  faChevronRight,
  faChevronDown,
  faChevronUp,
  faEye,
  faLayerGroup,
)

const stubPage = { name: 'StoryStub', template: '<div />' }

setup((app) => {
  app.use(createPinia())
  app.use(
    createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: stubPage },
        { path: '/:pathMatch(.*)*', name: 'story-catch-all', component: stubPage },
      ],
    }),
  )
  app.component('font-awesome-icon', FontAwesomeIcon)
})
