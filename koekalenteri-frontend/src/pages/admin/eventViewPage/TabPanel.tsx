import { ReactNode } from 'react'

interface Props {
  index: number
  activeTab: number
  children?: ReactNode
}

const TabPanel = ({ index, activeTab, children }: Props) => {
  return (
    <div role="tabpanel" style={{minHeight: 400, display: activeTab === index ? 'flex' : 'none', flexDirection: 'column', flex: 1, overflow: 'auto'}}>
      {index === activeTab && (
        <>{children}</>
      )}
    </div>
  )
}

export default TabPanel
