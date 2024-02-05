<template>
  <!--we use div here to be able to set class for this component, particularly margins-->
  <div>
    <v-tooltip v-if="tooltip" top>
      <template #activator="{on}">
        <v-btn
          small
          :color="color !== undefined ? color : 'primary'"
          :depressed="depressed"
          :disabled="disabled"
          v-on="on"
          @click="(event) => $emit('click', event)"
        >
          <v-icon :left="Boolean(caption)">
            {{ iconName }}
          </v-icon>
          {{ caption }}
        </v-btn>
      </template>
      {{ tooltip }}
    </v-tooltip>
    <v-btn
      v-else
      small
      :color="color !== undefined ? color : 'primary'"
      :depressed="depressed"
      :disabled="disabled"
      @click="(event) => $emit('click', event)"
    >
      <v-icon :left="Boolean(caption)">
        {{ iconName }}
      </v-icon>
      {{ caption }}
    </v-btn>
  </div>
</template>

<script lang="ts">

export default defineComponent({
  props: {
    iconName: String,
    color: String,
    tooltip: String,
    depressed: Boolean,
    disabled: Boolean,
    caption: String,
  },
});
</script>

<style scoped></style>
