import { Box } from "@mui/material";
import { ReactNode } from "react";

type FullPageFlexProps = {
  children?: ReactNode
}

export function FullPageFlex(props: FullPageFlexProps) {
  return (
    <Box sx={{ display: 'flex', p: 1, overflow: 'hidden', height: '100%', flexDirection: 'column', alignItems: 'flex-start' }}>
      <Box sx={{
        display: 'flex',
        flexDirection: 'column',
        flexGrow: 1,
        width: '100%',
        minHeight: 600,
      }}>
        {props.children}
      </Box>
    </Box>
  );
}
