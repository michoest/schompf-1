<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAppStore, useSessionStore, useDataStore } from '@/stores'
import { useLiveStore } from '@/stores/live'
import { setUnauthorizedHandler } from '@/services/api'

const isDevInstance = import.meta.env.VITE_APP_NAME === 'Schompf Dev'
const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const session = useSessionStore()
const data = useDataStore()
const live = useLiveStore()

const windowWidth = ref(window.innerWidth)
const isMobile = computed(() => windowWidth.value < 960)
const menu = ref(false)

const mainNav = [
  { title: 'Heute', icon: 'mdi-silverware-fork-knife', to: '/heute' },
  { title: 'Plan', icon: 'mdi-calendar-week', to: '/plan' },
  { title: 'Einkauf', icon: 'mdi-cart-outline', to: '/einkauf' },
]
const adminNav = [
  { title: 'Gerichte', icon: 'mdi-book-open-variant', to: '/verwaltung/gerichte' },
  { title: 'Produkte', icon: 'mdi-food-apple-outline', to: '/verwaltung/produkte' },
  { title: 'Läden & Warengruppen', icon: 'mdi-store-outline', to: '/verwaltung/laeden' },
]

const title = computed(() => route.meta?.title || 'Schompf')
const showChrome = computed(() => !route.meta?.public)

function onResize() { windowWidth.value = window.innerWidth }
function onVisibility() { if (document.visibilityState === 'visible' && session.loggedIn) live.resume() }

async function startSession() {
  try {
    await Promise.all([session.load(), data.load()])
    live.start()
  } catch (e) {
    if (e.status !== 401) appStore.showError(e, 'Server nicht erreichbar')
  }
}

function logout() {
  live.stop()
  session.logout()
  router.push('/login')
}

setUnauthorizedHandler(() => {
  live.stop()
  session.logout()
  if (route.name !== 'login') router.push({ name: 'login', query: { next: route.fullPath } })
})

watch(() => session.loggedIn, loggedIn => { if (loggedIn) startSession() })

onMounted(() => {
  window.addEventListener('resize', onResize)
  document.addEventListener('visibilitychange', onVisibility)
  if (session.loggedIn) startSession()
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  document.removeEventListener('visibilitychange', onVisibility)
  live.stop()
})
</script>

<template>
  <v-app>
    <div class="safe-area-bg" />

    <v-app-bar v-if="showChrome" color="primary" elevation="0" density="comfortable" class="safe-area-top">
      <template #prepend>
        <v-btn v-if="route.meta?.back" icon="mdi-arrow-left" @click="router.back()" />
        <v-icon v-else icon="mdi-chef-hat" class="ml-3" />
      </template>
      <v-app-bar-title>
        {{ title }}
        <v-chip v-if="isDevInstance" size="x-small" variant="flat" color="white" class="ml-2 font-weight-bold">DEV</v-chip>
      </v-app-bar-title>
      <template #append>
        <v-menu v-model="menu">
          <template #activator="{ props }">
            <v-btn icon="mdi-dots-vertical" v-bind="props" />
          </template>
          <v-list density="comfortable" min-width="240">
            <v-list-subheader>Verwaltung</v-list-subheader>
            <v-list-item v-for="item in adminNav" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" />
            <v-divider class="my-1" />
            <v-list-item prepend-icon="mdi-account" :title="session.person?.name ?? 'Angemeldet'" :subtitle="session.device?.name" />
            <v-list-item prepend-icon="mdi-logout" title="Abmelden" @click="logout" />
          </v-list>
        </v-menu>
      </template>
    </v-app-bar>

    <v-navigation-drawer v-if="showChrome && !isMobile" permanent rail expand-on-hover color="surface">
      <v-list density="comfortable" nav>
        <v-list-item v-for="item in mainNav" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" color="primary" />
        <v-divider class="my-2" />
        <v-list-item v-for="item in adminNav" :key="item.to" :to="item.to" :prepend-icon="item.icon" :title="item.title" color="primary" />
      </v-list>
    </v-navigation-drawer>

    <v-main class="bg-background" :class="{ 'main-mobile': isMobile && showChrome }">
      <v-container fluid class="pa-3 page mx-auto" :class="{ 'container-mobile': isMobile && showChrome }">
        <router-view />
      </v-container>
    </v-main>

    <v-bottom-navigation v-if="showChrome && isMobile" grow color="primary" elevation="8" class="safe-area-bottom">
      <v-btn v-for="item in mainNav" :key="item.to" :to="item.to">
        <v-icon>{{ item.icon }}</v-icon>
        <span class="text-caption mt-1">{{ item.title }}</span>
      </v-btn>
    </v-bottom-navigation>

    <v-snackbar v-model="appStore.snackbar.show" :color="appStore.snackbar.color" :timeout="3500" location="top">
      {{ appStore.snackbar.message }}
      <template #actions>
        <v-btn variant="text" @click="appStore.hideSnackbar()">OK</v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<style>
.safe-area-bg {
  position: fixed; top: 0; left: 0; right: 0;
  height: env(safe-area-inset-top);
  background: rgb(var(--v-theme-primary));
  z-index: 1000;
}
.safe-area-top { padding-top: env(safe-area-inset-top) !important; }
.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom) !important;
  height: calc(56px + env(safe-area-inset-bottom)) !important;
}
.main-mobile { padding-top: calc(56px + env(safe-area-inset-top)) !important; }
.container-mobile { padding-bottom: calc(72px + env(safe-area-inset-bottom)) !important; }
.page { max-width: 900px; }
</style>
