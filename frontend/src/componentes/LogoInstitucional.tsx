import logoLiceo from '../../../logo_liceo.jpg'

export function LogoInstitucional({ className = '', src }: { className?: string; src?: string }) {
  const fuente = !src || src === 'logo_liceo.jpg' ? logoLiceo : src.startsWith('/') && !src.startsWith('//') ? src : logoLiceo
  return <img className={`logo-institucional ${className}`.trim()} src={fuente} alt="Logo institucional" />
}
