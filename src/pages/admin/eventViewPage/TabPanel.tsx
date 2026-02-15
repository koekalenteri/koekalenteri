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
        display: activeTab === index ? 'flex' : 'none',
        flexDirection: 'column',
        minHeight: 400,
        width: '100%',
      }}
    >
      {index === activeTab && <>{children}</>}
    </div>
  )
}

export default TabPanel
