<template>
  <ClientOnly>
    <div class="rich-text-editor" :class="{ 'opacity-50 pointer-events-none': disabled }">
      <!-- Toolbar -->
      <div class="flex items-center gap-0.5 px-2 py-1.5 border border-b-0 border-gray-300 dark:border-gray-700 rounded-t-md bg-gray-50 dark:bg-gray-800">
        <button
          type="button"
          class="rte-btn font-bold"
          :class="{ 'rte-btn-active': editor?.isActive('bold') }"
          @click="editor?.chain().focus().toggleBold().run()"
          title="Bold"
        >
          B
        </button>
        <button
          type="button"
          class="rte-btn italic"
          :class="{ 'rte-btn-active': editor?.isActive('italic') }"
          @click="editor?.chain().focus().toggleItalic().run()"
          title="Italic"
        >
          I
        </button>
        <button
          type="button"
          class="rte-btn line-through"
          :class="{ 'rte-btn-active': editor?.isActive('strike') }"
          @click="editor?.chain().focus().toggleStrike().run()"
          title="Strikethrough"
        >
          S
        </button>
        <div class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          type="button"
          class="rte-btn"
          :class="{ 'rte-btn-active': editor?.isActive('bulletList') }"
          @click="editor?.chain().focus().toggleBulletList().run()"
          title="Bullet list"
        >
          <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
        </button>
        <button
          type="button"
          class="rte-btn text-xs font-semibold"
          :class="{ 'rte-btn-active': editor?.isActive('orderedList') }"
          @click="editor?.chain().focus().toggleOrderedList().run()"
          title="Numbered list"
        >
          1.
        </button>
        <div class="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <button
          type="button"
          class="rte-btn"
          :class="{ 'rte-btn-active': editor?.isActive('link') }"
          @click="toggleLink"
          title="Link"
        >
          <UIcon name="i-heroicons-link" class="w-4 h-4" />
        </button>

        <!-- Character counter -->
        <span
          class="ml-auto text-xs tabular-nums"
          :class="textLength > maxLength ? 'text-red-500 font-semibold' : 'text-gray-400 dark:text-gray-500'"
        >
          {{ textLength }} / {{ maxLength }}
        </span>
      </div>

      <!-- Editor -->
      <EditorContent
        :editor="editor"
        class="rte-content border border-gray-300 dark:border-gray-700 rounded-b-md bg-white dark:bg-gray-900 focus-within:ring-2 focus-within:ring-primary-500 focus-within:border-primary-500"
      />
    </div>

    <template #fallback>
      <UTextarea
        :model-value="modelValue"
        :placeholder="placeholder"
        :rows="3"
        disabled
      />
    </template>
  </ClientOnly>
</template>

<script setup lang="ts">
import { useEditor, EditorContent } from '@tiptap/vue-3'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'

const props = withDefaults(defineProps<{
  modelValue?: string
  placeholder?: string
  maxLength?: number
  disabled?: boolean
}>(), {
  modelValue: '',
  placeholder: '',
  maxLength: 500,
  disabled: false,
})

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const textLength = ref(0)

const editor = useEditor({
  content: props.modelValue || '',
  editable: !props.disabled,
  extensions: [
    StarterKit.configure({
      heading: false,
      blockquote: false,
      codeBlock: false,
      code: false,
      horizontalRule: false,
    }),
    Link.configure({
      openOnClick: false,
      HTMLAttributes: {
        rel: 'noopener noreferrer nofollow',
        target: '_blank',
      },
    }),
    Placeholder.configure({
      placeholder: props.placeholder,
    }),
  ],
  onUpdate: ({ editor }) => {
    const text = editor.getText()
    textLength.value = text.length
    const html = editor.getHTML()
    // Emit empty string when editor is empty instead of <p></p>
    emit('update:modelValue', text.trim() === '' ? '' : html)
  },
  onCreate: ({ editor }) => {
    textLength.value = editor.getText().length
  },
})

function toggleLink() {
  if (!editor.value) return

  if (editor.value.isActive('link')) {
    editor.value.chain().focus().unsetLink().run()
    return
  }

  const url = window.prompt('Enter URL:')
  if (!url) return

  editor.value
    .chain()
    .focus()
    .extendMarkRange('link')
    .setLink({ href: url })
    .run()
}

watch(() => props.modelValue, (newValue) => {
  if (!editor.value) return
  const currentHtml = editor.value.getHTML()
  // Avoid re-setting content when it matches (prevents cursor jump)
  if (newValue === currentHtml) return
  if (!newValue && currentHtml === '<p></p>') return
  editor.value.commands.setContent(newValue || '', { emitUpdate: false })
  textLength.value = editor.value.getText().length
})

watch(() => props.disabled, (newValue) => {
  editor.value?.setEditable(!newValue)
})

onBeforeUnmount(() => {
  editor.value?.destroy()
})
</script>

<style>
.rte-btn {
  @apply flex items-center justify-center w-7 h-7 rounded text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors;
}
.rte-btn-active {
  @apply bg-gray-200 dark:bg-gray-700 text-primary-500;
}

.rte-content .tiptap {
  @apply px-3 py-2 text-sm min-h-[5rem] max-h-[12rem] overflow-y-auto text-gray-900 dark:text-gray-100;
  outline: none;
}

.rte-content .tiptap p.is-editor-empty:first-child::before {
  @apply text-gray-400 dark:text-gray-500 pointer-events-none float-left h-0;
  content: attr(data-placeholder);
}

/* Rich text display styles */
.rte-content .tiptap ul {
  @apply list-disc pl-5 my-1;
}
.rte-content .tiptap ol {
  @apply list-decimal pl-5 my-1;
}
.rte-content .tiptap li {
  @apply my-0.5;
}
.rte-content .tiptap a {
  @apply text-primary-500 underline;
}
.rte-content .tiptap strong {
  @apply font-bold;
}
.rte-content .tiptap em {
  @apply italic;
}
</style>
