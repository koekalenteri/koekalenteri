import type { ReactNode } from 'react'

interface Props {
  index: number
  activeTab: number
  children?: ReactNode
}

const TabPanel = ({ index, activeTab, children }: Props) => {
  return (
    <div
      role="tabpanel"
      style={{
        width: '100%',
        minHeight: 400,
        display: activeTab === index ? 'block' : 'none',
      }}
    >
      {index === activeTab && <>{children}</>}
    </div>
  )
}

export default TabPanel
