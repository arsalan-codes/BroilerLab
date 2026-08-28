import React from 'react';
import {
  Card as MuiCard,
  CardContent,
  CardHeader,
  Button as MuiButton,
  Chip,
  Stack,
  Typography,
  Box,
  Paper,
  useTheme,
} from '@mui/material';
import type { ButtonProps as MuiButtonProps } from '@mui/material/Button';
import { useStore } from '../store';

type Tone = 'default' | 'primary' | 'secondary' | 'warning' | 'error' | 'success';

function toneColor(theme: any, tone: Tone) {
  switch (tone) {
    case 'primary':
      return theme.palette.primary.main;
    case 'secondary':
      return theme.palette.secondary.main;
    case 'warning':
      return theme.palette.warning?.main ?? '#e99b26';
    case 'error':
      return theme.palette.error.main;
    case 'success':
      return theme.palette.success?.main ?? '#19c39a';
    default:
      return theme.palette.text.secondary;
  }
}

export function Card({
  title,
  icon,
  subtitle,
  children,
  right,
  sx,
  contentSx,
  id,
  className,
  style,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  subtitle?: React.ReactNode;
  children: React.ReactNode;
  right?: React.ReactNode;
  sx?: any;
  contentSx?: any;
  id?: string;
  className?: string;
  style?: any;
}) {
  return (
    <MuiCard
      id={id}
      elevation={0}
      className={className}
      sx={{
        borderRadius: 3,
        border: (t: any) => `1px solid ${t.palette.divider}`,
        bgcolor: 'background.paper',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        ...(style ? { ...style } : {}),
        ...sx,
      }}
    >
      {(title || right) && (
        <CardHeader
          avatar={icon}
          title={title}
          subheader={subtitle}
          action={right}
          titleTypographyProps={{ variant: 'h6', sx: { fontWeight: 700 } }}
          subheaderTypographyProps={{ variant: 'body2' }}
          sx={{ pb: 0.5 }}
        />
      )}
      <CardContent sx={{ pt: title ? 0.5 : 2, flex: 1, ...contentSx }}>{children}</CardContent>
    </MuiCard>
  );
}

export function Button({
  tone = 'default',
  children,
  ...props
}: { tone?: Tone; children: React.ReactNode } & MuiButtonProps) {
  const theme = useTheme() as any;
  const color =
    tone === 'primary'
      ? 'primary'
      : tone === 'secondary'
        ? 'secondary'
        : tone === 'error'
          ? 'error'
          : 'inherit';

  const isOutlinedGhost = tone === 'default' || tone === 'warning';
  return (
    <MuiButton
      variant={isOutlinedGhost ? 'outlined' : 'contained'}
      color={color as any}
      sx={{
        textTransform: 'none',
        fontWeight: 600,
        borderRadius: 2.5,
        ...(tone === 'warning' ? { borderColor: theme.palette.warning?.main, color: theme.palette.warning?.main } : {}),
        ...(tone === 'success' ? { bgcolor: theme.palette.success?.main, color: '#00201a' } : {}),
      }}
      {...props}
    >
      {children}
    </MuiButton>
  );
}

export function Kpi({
  label,
  value,
  sub,
  tone = 'default',
  color,
  icon,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: Tone;
  color?: string;
  icon?: React.ReactNode;
}) {
  const theme = useTheme() as any;
  const c = color ?? toneColor(theme, tone);
  return (
    <MuiCard
      elevation={0}
      sx={{
        borderRadius: 3,
        border: (t: any) => `1px solid ${t.palette.divider}`,
        p: 2,
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 600 }}>
          {label}
        </Typography>
        {icon && <Box sx={{ color: c, opacity: 0.9 }}>{icon}</Box>}
      </Stack>
      <Typography variant="h4" sx={{ mt: 0.5, color: c, lineHeight: 1.1, fontWeight: 800 }}>
        {value}
      </Typography>
      {sub && (
        <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5, display: 'block' }}>
          {sub}
        </Typography>
      )}
    </MuiCard>
  );
}

export function Tag({
  tone = 'success',
  kind,
  children,
  sx,
}: {
  tone?: Tone;
  kind?: string;
  children: React.ReactNode;
  sx?: any;
}) {
  const theme = useTheme() as any;
  const effectiveTone: Tone = (kind as Tone) || tone;
  const map: Record<Tone, { bg: string; fg: string }> = {
    success: { bg: (theme.palette.success?.main ?? '#19c39a') + '22', fg: theme.palette.success?.main ?? '#19c39a' },
    warning: { bg: (theme.palette.warning?.main ?? '#e99b26') + '22', fg: theme.palette.warning?.main ?? '#e99b26' },
    error: { bg: theme.palette.error.main + '22', fg: theme.palette.error.main },
    secondary: { bg: theme.palette.secondary.main + '22', fg: theme.palette.secondary.main },
    primary: { bg: theme.palette.primary.main + '22', fg: theme.palette.primary.main },
    default: { bg: theme.palette.divider, fg: theme.palette.text.secondary },
  };
  const m = map[effectiveTone];
  return (
    <Chip
      label={children}
      size="small"
      sx={{
        fontWeight: 600,
        bgcolor: m.bg,
        color: m.fg,
        border: 'none',
        ...sx,
      }}
    />
  );
}

export function MiniStat({ value, label }: { value: React.ReactNode; label: React.ReactNode }) {
  return (
    <Box sx={{ textAlign: 'center', px: 1.5 }}>
      <Typography variant="h6" sx={{ fontWeight: 800, lineHeight: 1.1 }}>
        {value}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {label}
      </Typography>
    </Box>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <Stack
      spacing={1}
      sx={{
        position: 'fixed',
        bottom: 18,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        width: 'max-content',
        maxWidth: '90vw',
      }}
    >
      {toasts.map((t) => (
        <Paper
          key={t.id}
          elevation={6}
          onClick={() => dismiss(t.id)}
          sx={{
            px: 2,
            py: 1,
            borderRadius: 2,
            cursor: 'pointer',
            fontSize: 13,
            fontWeight: 600,
            border: (th: any) => `1px solid ${th.palette.divider}`,
          }}
        >
          {t.msg}
        </Paper>
      ))}
    </Stack>
  );
}
