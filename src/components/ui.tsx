import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { TournamentStatus } from '../types/homepage'

interface LinkButtonProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  children: ReactNode
}

export function PrimaryButton({ href, children, className = '', ...props }: LinkButtonProps) {
  return (
    <a className={`button button--primary ${className}`} href={href} {...props}>
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2.2} />
    </a>
  )
}

export function SecondaryButton({ href, children, className = '', ...props }: LinkButtonProps) {
  return (
    <a className={`button button--secondary ${className}`} href={href} {...props}>
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" size={17} strokeWidth={2.2} />
    </a>
  )
}

interface SectionHeadingProps {
  eyebrow: string
  title: string
  description?: string
  action?: ReactNode
  id?: string
}

export function SectionHeading({ eyebrow, title, description, action, id }: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <div className="section-heading__copy">
        <p className="section-heading__eyebrow">{eyebrow}</p>
        <h2 id={id}>{title}</h2>
        {description && <p className="section-heading__description">{description}</p>}
      </div>
      {action && <div className="section-heading__action">{action}</div>}
    </div>
  )
}

interface StatusBadgeProps {
  status: TournamentStatus
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const statusClass = status.toLowerCase().replaceAll(' ', '-')

  return <span className={`status-badge status-badge--${statusClass}`}>{status}</span>
}