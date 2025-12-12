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
    <!-- App Bar -->
    <v-app-bar 
      color="primary" 
      density="comfortable"
      elevation="0"
    >
      <v-app-bar-nav-icon 
        v-if="!isMobile"
        @click="rail = !rail"
      />
      
      <v-app-bar-title class="d-flex align-center">
        <v-icon icon="mdi-chef-hat" class="mr-2" />
        <span class="font-weight-bold">Schompf</span>
      </v-app-bar-title>
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
    <v-main class="bg-background">
      <v-container fluid class="pa-4" :class="{ 'pb-20': isMobile }">
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
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.15s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.pb-20 {
  padding-bottom: 80px !important;
}

.mb-16 {
  margin-bottom: 64px !important;
}
</style>