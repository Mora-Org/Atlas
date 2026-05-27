'use client'

import React from 'react'
import { PublishProvider } from '@/contexts/PublishContext'
import { PublishStudio } from '@/components/publish/PublishStudio'

export default function PublishPage() {
  return (
    <PublishProvider>
      <PublishStudio />
    </PublishProvider>
  )
}
