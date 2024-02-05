<template>
  <nav>
    <v-navigation-drawer v-model="drawer" :enable-resize-watcher="drawer" app left>
      <v-list>
        <template v-for="[name, route] in routesMap.entries()" :key="name">
          <v-list-item
            v-if="!route.group && !route.parent"
            :to="route.path"
          >{{route.title}}</v-list-item>
        </template>

        <v-list-group v-for="[name, route] in routesMap.entries()" :key="name">
          <template v-if="route.group" v-slot:activator="{props}">
            <v-list-item
              v-bind="props"
            >{{route.title}}</v-list-item>
          </template>

          <template v-for="[childName, childRoute] in routesMap.entries()">
            <v-list-item
              v-if="childRoute.parent === name"
              :key="childName"
              :to="childRoute.path"
            >
              <v-list-item>
                {{ childRoute.title }}
              </v-list-item>
            </v-list-item>
          </template>
        </v-list-group>
      </v-list>
    </v-navigation-drawer>

    <v-app-bar app clipped-right>
      <v-app-bar-nav-icon @click.stop="drawer = !drawer" />
      <v-toolbar-title>{{ toolbarTitle || "Some title" }}</v-toolbar-title>
      <v-spacer />
        <v-divider vertical inset />
            <div class="mx-4 company-name">
                {{ 'Awesome company' }}
            </div>
        <v-divider vertical inset />
      <p class="user ml-4">
        {{ "Вася Васин" }}
      </p>
      <v-btn color="primary" variant="elevated"> {{ "Войти/выйти" }}</v-btn>
    </v-app-bar>
  </nav>
</template>

<script lang="ts">
import {isRouteName, ROUTES} from '~/common/routes';
import {assertIsDefined} from "~/common/assertions";

export default defineComponent({
  name: 'AppHeader',

  setup() {
    const root = getCurrentInstance().proxy;

    const drawer = ref(false);
    const routesMap = ROUTES();

    const toolbarTitle = computed(() => {
      const routeName = root.$route.name;
      assertIsDefined(routeName);
      if (isRouteName(routeName)) {
        // in case of dynamic routes just skip the title set up
        return routesMap.has(routeName) ? routesMap.checkedGet(routeName).title : '';
      }
    });

    watch(
      () => root.$route,
      () => {
        drawer.value = false;
      },
    );



    return {
      root,
      drawer,
      routesMap,
      toolbarTitle,
    };
  },
});
</script>

<style lang="sass" scoped>
.user
  margin-bottom: 0
  margin-right: 15px

.company-name
  font-size: 1.25rem
  font-weight: bold
  text-align: center
</style>
