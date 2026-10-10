import { createRouter, createWebHistory } from 'vue-router'
import { hasToken } from '@/services/api'

const routes = [
  { path: '/', redirect: '/heute' },
  { path: '/login', name: 'login', component: () => import('@/views/LoginView.vue'), meta: { title: 'Anmelden', public: true } },
  { path: '/heute', name: 'heute', component: () => import('@/views/HeuteView.vue'), meta: { title: 'Heute' } },
  { path: '/plan', name: 'plan', component: () => import('@/views/PlanView.vue'), meta: { title: 'Plan' } },
  { path: '/einkauf', name: 'einkauf', component: () => import('@/views/EinkaufView.vue'), meta: { title: 'Einkauf' } },
  { path: '/gericht/:id', name: 'gericht', component: () => import('@/views/GerichtView.vue'), meta: { title: 'Gericht', back: true } },
  { path: '/verwaltung/gerichte', name: 'gerichte', component: () => import('@/views/GerichteView.vue'), meta: { title: 'Gerichte' } },
  { path: '/verwaltung/gerichte/:id', name: 'gericht-bearbeiten', component: () => import('@/views/GerichtEditView.vue'), meta: { title: 'Gericht bearbeiten', back: true } },
  { path: '/verwaltung/produkte', name: 'produkte', component: () => import('@/views/ProdukteView.vue'), meta: { title: 'Produkte' } },
  { path: '/verwaltung/laeden', name: 'laeden', component: () => import('@/views/LaedenView.vue'), meta: { title: 'Läden & Warengruppen' } },
  // alte Pfade (Lesezeichen / installierte App)
  { path: '/planer', redirect: '/plan' },
  { path: '/einkaufsliste', redirect: '/einkauf' },
  { path: '/:pathMatch(.*)*', redirect: '/heute' },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(to => {
  if (!to.meta.public && !hasToken()) return { name: 'login', query: { next: to.fullPath } }
})

export default router
