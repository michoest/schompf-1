import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  {
    path: '/',
    name: 'home',
    redirect: '/planer'
  },
  {
    path: '/planer',
    name: 'planer',
    component: () => import('@/views/PlanerView.vue'),
    meta: { title: 'Planer', icon: 'mdi-calendar' }
  },
  {
    path: '/einkaufsliste',
    name: 'shopping-list',
    component: () => import('@/views/ShoppingListView.vue'),
    meta: { title: 'Einkaufsliste', icon: 'mdi-cart' }
  },
  {
    path: '/verwaltung',
    name: 'verwaltung',
    component: () => import('@/views/VerwaltungView.vue'),
    meta: { title: 'Verwaltung', icon: 'mdi-database-cog' }
  },
  {
    path: '/einstellungen',
    name: 'settings',
    component: () => import('@/views/SettingsView.vue'),
    meta: { title: 'Einstellungen', icon: 'mdi-cog' }
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

export default router
