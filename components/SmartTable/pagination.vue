<template lang="html">
  <v-row class="pagination" justify="end" align="start">
    <span class="small">Строк на странице: </span>
    <select class="per-page" :value="perPage" @change="changePerPage($event)">
      <option v-for="(item, i) of perPageSelect" :key="i" :value="item">
        {{ item }}
      </option>
    </select>
    <v-icon @click="changePage(false)"> mdi-arrow-left </v-icon>
    <span>{{ inPage }} из {{ totalResults }}</span>
    <v-icon @click="changePage(true)"> mdi-arrow-right </v-icon>
  </v-row>
</template>

<script>
export default {
  props: ['props', 'localStore'],
  data() {
    return {
      perPageSelect: [5, 10, 20, 30, 50, 80],
    };
  },
  computed: {
    inPage() {
      let result = '';
      if (this.page === 1 && this.page * this.perPage < this.totalResults) {
        result = `1 - ${this.perPage}`;
      } else if (this.page !== 1 && this.page * this.perPage <= this.totalResults) {
        result = `${(this.page - 1) * this.perPage + 1} - ${this.page * this.perPage}`;
      } else if (this.page !== 1 && this.page * this.perPage > this.totalResults) {
        result = `${(this.page - 1) * this.perPage + 1} - ${this.totalResults}`;
      } else {
        result = `1 - ${this.totalResults}`;
      }
      return result;
    },
    totalResults() {
      return this.localStore.getters.getTotalResults;
    },
    totalPages() {
      return this.localStore.getters.getTotalPages;
    },
    perPage() {
      return this.localStore.getters.getPerPage;
    },
    page() {
      return this.localStore.getters.getPage;
    },
  },
  methods: {
    changePage(positive) {
      if (positive && this.page * this.perPage < this.totalResults) {
        this.localStore.commit('setServerParamsProp', {name: 'page', value: this.page + 1});
        this.props.pageChanged({currentPage: this.page});
      } else if (!positive && this.page > 1) {
        this.localStore.commit('setServerParamsProp', {name: 'page', value: this.page - 1});
        this.props.pageChanged({currentPage: this.page});
      }
    },
    changePerPage(e) {
      this.localStore.commit('setServerParamsProp', {name: 'perPage', value: e.target.value});
      this.localStore.dispatch('loadData');
    },
  },
};
</script>

<style lang="sass" scoped>
.pagination
  display: flex

  i
    margin: 0 10px

  .small
    margin-right: 10px
    font-size: 0.8em

  .per-page
    padding: 0 10px 0 10px
    border: 1px solid #888888
    border-radius: 5px
    margin-right: 15px
</style>
