<template>
  <RecordPanelDialog v-for="entry in recordPanelDialogs" :key="entry.key" :entry="entry" />
</template>

<script setup>
import RecordPanelDialog from '@/components/Modals/RecordPanelDialog.vue'
import { recordPanelDialogs } from '@/utils/renderRecordPanelDialog'
</script>
