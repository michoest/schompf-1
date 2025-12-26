<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAppStore } from '@/stores'

const route = useRoute()
const appStore = useAppStore()

const drawer = ref(true)
const rail = ref(true)
const windowWidth = ref(window.innerWidth)

const navItems = [
  { title: 'Planer', icon: 'mdi-calendar', to: '/planer' },
  { title: 'Einkaufsliste', icon: 'mdi-cart', to: '/einkaufsliste' },
  { title: 'Verwaltung', icon: 'mdi-database-cog', to: '/verwaltung' },
  { title: 'Einstellungen', icon: 'mdi-cog', to: '/einstellungen' },
]

const currentTitle = computed(() => {
  return route.meta?.title || 'Schompf'
})

const isMobile = computed(() => windowWidth.value < 960)

function onResize() {
  windowWidth.value = window.innerWidth
}

onMounted(() => {
  window.addEventListener('resize', onResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', onResize)
})
</script>

<template>
  <v-app>
    <!-- Safe area background for top -->
    <div class="safe-area-bg" />

    <!-- App Bar -->
    <v-app-bar
      color="primary"
      density="comfortable"
      elevation="0"
      class="safe-area-top"
    >
      <v-app-bar-nav-icon
        v-if="!isMobile"
        @click="rail = !rail"
      />

      <v-app-bar-title class="d-flex align-center justify-center">
        <v-icon icon="mdi-chef-hat" />
      </v-app-bar-title>

      <!-- Spacer for centering on desktop -->
      <template v-if="!isMobile" #append>
        <div style="width: 48px;"></div>
      </template>
    </v-app-bar>

    <!-- Navigation Drawer (Desktop only) -->
    <v-navigation-drawer
      v-if="!isMobile"
      v-model="drawer"
      :rail="rail"
      permanent
      color="surface"
    >
      <v-list 
        density="comfortable" 
        nav
        class="pa-2"
      >
        <v-list-item
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          :prepend-icon="item.icon"
          :title="item.title"
          rounded="lg"
          color="primary"
          class="mb-1"
        />
      </v-list>

      <template #append>
        <div class="pa-2">
          <v-btn
            :icon="rail ? 'mdi-chevron-right' : 'mdi-chevron-left'"
            variant="text"
            size="small"
            @click="rail = !rail"
            block
          />
        </div>
      </template>
    </v-navigation-drawer>

    <!-- Main Content -->
    <v-main class="bg-background" :class="{ 'main-mobile': isMobile }">
      <v-container fluid class="pa-4" :class="{ 'container-mobile': isMobile }">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </v-container>
    </v-main>

    <!-- Bottom Navigation (Mobile only) -->
    <v-bottom-navigation
      v-if="isMobile"
      grow
      color="primary"
      elevation="8"
      fixed
      class="safe-area-bottom"
    >
      <v-btn 
        v-for="item in navItems.slice(0, 5)" 
        :key="item.to"
        :to="item.to"
      >
        <v-icon>{{ item.icon }}</v-icon>
        <span class="text-caption mt-1">{{ item.title }}</span>
      </v-btn>
    </v-bottom-navigation>

    <!-- Global Snackbar -->
    <v-snackbar
      v-model="appStore.snackbar.show"
      :color="appStore.snackbar.color"
      :timeout="3000"
      location="top"
    >
      {{ appStore.snackbar.message }}
      <template #actions>
        <v-btn
          variant="text"
          @click="appStore.hideSnackbar()"
        >
          Schließen
        </v-btn>
      </template>
    </v-snackbar>
  </v-app>
</template>

<style>
/* Safe area support for PWA */
.safe-area-bg {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: env(safe-area-inset-top);
  background: rgb(var(--v-theme-primary));
  z-index: 1000;
}

.safe-area-top {
  padding-top: env(safe-area-inset-top) !important;
}

.safe-area-bottom {
  padding-bottom: env(safe-area-inset-bottom) !important;
  height: calc(56px + env(safe-area-inset-bottom)) !important;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* Mobile-specific spacing */
.main-mobile {
  padding-top: env(safe-area-inset-top) !important;
}

.container-mobile {
  padding-bottom: calc(100px + env(safe-area-inset-bottom)) !important;
}

/* FAB spacing for mobile - used in individual views */
.mb-16 {
  margin-bottom: calc(80px + env(safe-area-inset-bottom)) !important;
}
</style>