import type { ReactNode } from 'react'

interface Props {
  readonly index: number
  readonly activeTab: number
  readonly children?: ReactNode
}

const TabPanel = ({ index, activeTab, children }: Props) => {
  return (
    <div
      role="tabpanel"
      style={{
        width: '100%',
        minHeight: 400,
        display: activeTab === index ? 'flex' : 'none',
        flexDirection: 'column',
      }}
    >
      {index === activeTab && <>{children}</>}
    </div>
  )
}

export default TabPanel
