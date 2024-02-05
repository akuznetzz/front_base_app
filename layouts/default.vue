<template>
  <v-app>
    <app-header />
      <v-main>
        <slot/>
      </v-main>
  </v-app>
</template>

<script lang="ts">
import AppHeader from '~/framework/workspace-components/app-header.vue';

export default defineComponent({
  components: {
    AppHeader,
  },
});
</script>

<style lang="sass">
html
  font-family: "Source Sans Pro", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
  font-size: 16px
  word-spacing: 1px
  -ms-text-size-adjust: 100%
  -webkit-text-size-adjust: 100%
  -moz-osx-font-smoothing: grayscale
  -webkit-font-smoothing: antialiased
  box-sizing: border-box
  overflow-y: auto !important

h1
  padding: 10px

*, *:before, *:after
  box-sizing: border-box
  margin: 0
  font-weight: 300
</style>
