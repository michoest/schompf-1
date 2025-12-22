import 'vuetify/styles'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'
import { de } from 'vuetify/locale'

// Fresh, modern color palette
const schompfTheme = {
  dark: false,
  colors: {
    // Primary - Teal/Mint
    primary: '#0D9488',
    'primary-darken-1': '#0F766E',
    'primary-lighten-1': '#14B8A6',
    
    // Secondary - Cool Blue
    secondary: '#0EA5E9',
    'secondary-darken-1': '#0284C7',
    'secondary-lighten-1': '#38BDF8',
    
    // Accent - Warm Coral/Orange
    accent: '#F97316',
    'accent-darken-1': '#EA580C',
    'accent-lighten-1': '#FB923C',
    
    // Status colors
    success: '#10B981',
    warning: '#F59E0B',
    error: '#EF4444',
    info: '#6366F1',
    
    // Background
    background: '#F0FDFA',
    surface: '#FFFFFF',
    'surface-variant': '#F1F5F9',
    
    // Text
    'on-background': '#1E293B',
    'on-surface': '#334155',
    'on-primary': '#FFFFFF',
    'on-secondary': '#FFFFFF',
  },
  variables: {
    'border-color': '#E2E8F0',
    'border-opacity': 1,
    'high-emphasis-opacity': 0.87,
    'medium-emphasis-opacity': 0.60,
    'disabled-opacity': 0.38,
    'idle-opacity': 0.04,
    'hover-opacity': 0.08,
    'focus-opacity': 0.12,
    'selected-opacity': 0.12,
    'activated-opacity': 0.12,
    'pressed-opacity': 0.16,
    'dragged-opacity': 0.08,
  }
}

export default createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
  locale: {
    locale: 'de',
    messages: { de },
  },
  theme: {
    defaultTheme: 'schompfTheme',
    themes: {
      schompfTheme,
    },
  },
  defaults: {
    VBtn: {
      rounded: 'lg',
      elevation: 0,
    },
    VCard: {
      rounded: 'lg',
      elevation: 1,
    },
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VAutocomplete: {
      variant: 'outlined',
      density: 'comfortable',
    },
    VChip: {
      rounded: 'lg',
    },
    VList: {
      rounded: 'lg',
    },
  },
})
