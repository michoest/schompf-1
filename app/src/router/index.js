import { createRouter, createWebHistory } from 'vue-router'
import { hasToken } from '@/services/api'

const routes = [
  { path: '/', redirect: '/kochen' },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: 'Anmelden', public: true } },
  { path: '/plan', name: 'plan', component: () => import('@/views/PlanView.vue'), meta: { title: 'Planen' } },
  { path: '/einkauf', name: 'einkauf', component: () => import('@/views/EinkaufView.vue'), meta: { title: 'Einkaufen' } },
  { path: '/kochen', name: 'kochen', component: () => import('@/views/KochenView.vue'), meta: { title: 'Kochen' } },
  { path: '/gericht/:id', name: 'gericht', component: () => import('@/views/GerichtView.vue'), meta: { title: 'Gericht', back: true } },
  { path: '/verwaltung/gerichte', name: 'gerichte', component: () => import('@/views/GerichteView.vue'), meta: { title: 'Gerichte' } },
  { path: '/verwaltung/gerichte/:id', name: 'gericht-bearbeiten', component: () => import('@/views/GerichtEditView.vue'), meta: { title: 'Gericht bearbeiten', back: true } },
  { path: '/verwaltung/produkte', name: 'produkte', component: () => import('@/views/ProdukteView.vue'), meta: { title: 'Produkte' } },
  { path: '/einstellungen/benachrichtigungen', name: 'benachrichtigungen', component: () => import('@/views/BenachrichtigungenView.vue'), meta: { title: 'Benachrichtigungen' } },
  { path: '/verwaltung/anmerkungen', name: 'anmerkungen', component: () => import('@/views/AnmerkungenView.vue'), meta: { title: 'Anmerkungen' } },
  { path: '/verwaltung/laeden', name: 'laeden', component: () => import('@/views/LaedenView.vue'), meta: { title: 'Läden & Warengruppen' } },
  // alte Pfade (Lesezeichen / installierte App)
  { path: '/planer', redirect: '/plan' },
  { path: '/heute', redirect: '/kochen' },
  { path: '/einkaufsliste', redirect: '/einkauf' },
  { path: '/:pathMatch(.*)*', redirect: '/kochen' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(to => {
  if (!to.meta.public && !hasToken()) return { name: 'login', query: { next: to.fullPath } }
})

export default router
